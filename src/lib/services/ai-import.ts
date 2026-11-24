import "server-only";
import { HumanMessage, SystemMessage, type ContentBlock } from "@langchain/core/messages";
import { RunnableLambda, RunnableSequence } from "@langchain/core/runnables";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { and, gte, lte } from "drizzle-orm";
import ExcelJS from "exceljs";
import { z } from "zod";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { ApiError } from "@/lib/api-errors";
import { addDays, daysBetween } from "@/lib/dates";
import { transactionInput } from "@/lib/validation";
import { listCategories } from "./categories";
import { descriptionSuggestions } from "./transactions";

const DEFAULT_MODEL = "gemini-3.8-flash";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
const TEXT_EXTENSIONS = ["csv", "txt", "ofx", "qfx", "json", "tsv"];
const SHEET_EXTENSIONS = ["xlsx", "xlsm"];
// Vercel functions accept request bodies up to ~4.5 MB.
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_CHARS = 300_000;

const extraction = z.object({
  entries: z.array(
    z.object({
      date: z.string().optional().describe("YYYY-MM-DD; omit when the file shows no date or you are not sure"),
      description: z.string().describe("Short name of the purchase or income, in Portuguese, as the user would write it; empty string if unreadable"),
      amount: z.number().optional().describe("Positive value in BRL; omit when not sure"),
      kind: z.enum(["expense", "income"]),
      method: z.enum(["credit", "debit", "pix", "cash", "voucher"]).optional().describe("Omit when not sure"),
      category: z.string().optional().describe("Exactly one of the given category names; omit when none fits"),
      doubt: z.string().optional().describe("Short note in Portuguese when something is unclear; omit otherwise"),
    }),
  ),
  summary: z.string().describe("One short sentence in Portuguese about what the file is"),
});

export type ExtractedEntry = {
  date: string | null;
  description: string;
  amount: number | null;
  categoryId: string | null;
  method: NonNullable<z.infer<typeof extraction>["entries"][number]["method"]> | null;
  kind: "expense" | "income";
  doubt: string | null;
  duplicateOf: string | null;
};

function extensionOf(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function decodeText(buffer: ArrayBuffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    // Brazilian bank exports (OFX/CSV) are often Windows-1252.
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

async function sheetToText(buffer: ArrayBuffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const cellText = (value: ExcelJS.CellValue): string => {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === "object" && "result" in value) return cellText(value.result as ExcelJS.CellValue);
    if (typeof value === "object" && "richText" in value) return value.richText.map((part) => part.text).join("");
    if (typeof value === "object" && "text" in value) return String(value.text);
    return String(value);
  };
  return workbook.worksheets
    .map((sheet) => {
      const lines: string[] = [];
      sheet.eachRow((row) => {
        const cells = (row.values as ExcelJS.CellValue[]).slice(1).map((v) => cellText(v).replace(/[;\n]/g, " "));
        if (cells.some(Boolean)) lines.push(cells.join(";"));
      });
      return lines.length ? `### Aba "${sheet.name}"\n${lines.join("\n")}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

// Turns any supported file into model input: images and PDFs go as binary media, everything else as text.
async function filePart(file: File): Promise<{ part: ContentBlock.Multimodal.Image | ContentBlock.Multimodal.File | ContentBlock.Text; label: string }> {
  if (file.size > MAX_BYTES) throw new ApiError(422, `"${file.name}" é grande demais (máx. 4 MB). Divida o arquivo ou exporte um período menor.`);
  const extension = extensionOf(file.name);
  const buffer = await file.arrayBuffer();
  if (IMAGE_TYPES.includes(file.type)) return { part: { type: "image", mimeType: file.type, data: Buffer.from(buffer).toString("base64") }, label: "imagem" };
  if (file.type === "application/pdf" || extension === "pdf") return { part: { type: "file", mimeType: "application/pdf", data: Buffer.from(buffer).toString("base64") }, label: "PDF" };
  let text: string;
  if (SHEET_EXTENSIONS.includes(extension)) {
    text = await sheetToText(buffer).catch(() => {
      throw new ApiError(422, `Não consegui abrir a planilha "${file.name}".`);
    });
  } else if (extension === "xls") {
    throw new ApiError(422, "Planilhas .xls antigas não são suportadas. Salve como .xlsx ou CSV.");
  } else if (TEXT_EXTENSIONS.includes(extension) || file.type.startsWith("text/")) {
    text = decodeText(buffer);
  } else {
    throw new ApiError(422, `Formato de "${file.name}" não suportado. Use imagem, PDF, CSV, OFX, TXT ou XLSX.`);
  }
  if (!text.trim()) throw new ApiError(422, `"${file.name}" está vazio.`);
  if (text.length > MAX_TEXT_CHARS) throw new ApiError(422, `"${file.name}" tem conteúdo demais para uma leitura só. Exporte um período menor.`);
  return { part: { type: "text", text: `Conteúdo do arquivo "${file.name}":\n\n${text}` }, label: extension.toUpperCase() };
}

export function aiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function extractFromFile(file: File, today: string, hint: string | null) {
  if (!aiConfigured()) throw new ApiError(503, "A leitura por IA não está configurada: defina GEMINI_API_KEY.");
  const { part } = await filePart(file);

  const [categories, suggestions] = await Promise.all([listCategories(), descriptionSuggestions()]);
  const categoryList = categories.map((c) => `- ${c.name} (${c.kind === "income" ? "entrada" : "gasto"}${c.description ? `: ${c.description}` : ""})`).join("\n");
  const known = suggestions
    .slice(0, 60)
    .map((s) => s.description)
    .join(", ");

  const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  const model = new ChatGoogleGenerativeAI({ model: process.env.GEMINI_MODEL || DEFAULT_MODEL, apiKey: process.env.GEMINI_API_KEY, temperature: 0, maxRetries: 2 });

  // LangChain pipeline: messages → Gemini with structured output (Zod) → normalized entries → already-added check.
  const pipeline = RunnableSequence.from([
    RunnableLambda.from(() => [
      new SystemMessage(`Você lê arquivos financeiros de uma pessoa no Brasil (fotos de comprovantes e notas fiscais, faturas de cartão em PDF, extratos bancários em PDF/OFX/CSV, planilhas, prints de apps de banco, textos colados como o histórico de pagamentos do Google Pay/Google Wallet) e transforma em lançamentos para o app de finanças dela.

Regras:
- Um lançamento por compra/transação. Numa nota fiscal de um único estabelecimento, gere um lançamento só com o total (não item por item), a menos que a pessoa peça o contrário.
- Em extratos, faturas e históricos colados, inclua todas as transações do período, sem pular nenhuma.
- Históricos do Google Pay/Wallet costumam vir como blocos "estabelecimento / valor / data" (às vezes com o cartão usado); pagamentos por aproximação com cartão de crédito são credit, com débito são debit. Datas como "12 de nov." ou "ontem" são relativas a hoje.
- Compras parceladas na fatura: um lançamento com o valor da parcela do mês e a parcela na descrição, ex.: "Magazine Luiza (3/10)".
- Ignore pagamentos de fatura, transferências entre contas da própria pessoa, aplicações/resgates de investimento, estornos já compensados, saldos, limites, juros previstos e linhas de total.
- Na dúvida, NÃO chute: omita o campo (data, valor, forma de pagamento, categoria) ou deixe a descrição vazia, e explique em "doubt". A pessoa vai revisar e completar tudo antes de salvar.
- Valores sempre positivos, em reais. kind = "income" só para dinheiro que entrou (Pix recebido, salário, reembolso).
- Datas no formato YYYY-MM-DD. Hoje é ${today}; quando o ano não aparece, use o mais recente que não fique no futuro.
- Forma de pagamento: credit (cartão de crédito/fatura), debit, pix, cash, voucher (VR/VA/Ticket/Alelo/Sodexo/Caju). Omita se não der pra saber.
- Categoria: use exatamente um dos nomes da lista; omita se nenhum servir.
- Descrição curta e reconhecível, reaproveitando quando fizer sentido as descrições que a pessoa já usa: ${known || "(ainda nenhuma)"}.

Categorias disponíveis:
${categoryList || "(nenhuma)"}`),
      new HumanMessage({ content: [part, { type: "text", text: hint ? `Observação da pessoa: ${hint}` : "Extraia os lançamentos deste arquivo." }] }),
    ]),
    model.withStructuredOutput(extraction, { name: "lancamentos" }),
    RunnableLambda.from((parsed: z.infer<typeof extraction>) => ({
      summary: parsed.summary,
      entries: parsed.entries
        .filter((entry) => entry.description.trim() || (entry.amount ?? 0) > 0)
        .map((entry): ExtractedEntry => {
          const category = entry.category ? byName.get(entry.category.toLowerCase()) : undefined;
          return {
            date: entry.date && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) ? entry.date : null,
            description: entry.description.trim().slice(0, 120),
            amount: entry.amount && entry.amount > 0 ? Math.round(entry.amount * 100) / 100 : null,
            kind: entry.kind,
            categoryId: category && category.kind === entry.kind ? category.id : null,
            method: entry.kind === "expense" ? (entry.method ?? null) : null,
            doubt: entry.doubt ?? null,
            duplicateOf: null,
          };
        }),
    })),
    RunnableLambda.from(async (result: { summary: string; entries: ExtractedEntry[] }) => ({ ...result, entries: await markAlreadyAdded(result.entries) })),
  ]);

  try {
    return await pipeline.invoke({});
  } catch (error) {
    console.error(error);
    throw new ApiError(502, "A IA não conseguiu ler esse arquivo agora. Tente de novo em instantes.");
  }
}

// Anything with the same amount within two days of an entry already registered in that interval is marked as already added.
async function markAlreadyAdded(entries: ExtractedEntry[]) {
  if (!entries.length) return entries;
  const dates = entries.map((e) => e.date).filter((d): d is string => d !== null).sort();
  if (!dates.length) return entries;
  const existing = await db
    .select({ date: transactions.date, amount: transactions.amount, description: transactions.description })
    .from(transactions)
    .where(and(gte(transactions.date, addDays(dates[0], -2)), lte(transactions.date, addDays(dates.at(-1)!, 2))));
  const used = new Set<number>();
  return entries.map((entry) => {
    if (entry.amount === null || entry.date === null) return entry;
    const { amount, date } = entry;
    const index = existing.findIndex((row, i) => !used.has(i) && Math.abs(row.amount - amount) < 0.005 && Math.abs(daysBetween(row.date, date)) <= 2);
    if (index < 0) return entry;
    used.add(index);
    return { ...entry, duplicateOf: `${existing[index].description} (${existing[index].date.slice(8, 10)}/${existing[index].date.slice(5, 7)})` };
  });
}

export async function createMany(body: unknown) {
  const rows = z.array(transactionInput).min(1, "Nada para salvar").max(500).parse(body);
  const created = await db.insert(transactions).values(rows).returning({ id: transactions.id });
  return { created: created.length, ids: created.map((r) => r.id) };
}
