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
import { addDays, addMonths, daysBetween, monthOf } from "@/lib/dates";
import { amountFor, occursIn, paymentFor } from "@/lib/recurring";
import { importInput } from "@/lib/validation";
import { listCategories } from "./categories";
import { listRecurring, registerPayment, type RecurringRow } from "./recurring";
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
      planned: z.string().optional().describe("Code (like P3) of the budget item this entry pays or receives; omit when it is not one of them"),
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
  plannedId: string | null;
  plannedSource: "ai" | "amount" | null;
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

  const [categories, suggestions, recurringItems] = await Promise.all([listCategories(), descriptionSuggestions(), listRecurring()]);
  const plannedItems = recurringItems.filter((item) => item.active);
  const codes = new Map(plannedItems.map((item, index) => [`P${index + 1}`, item]));
  const plannedList = [...codes]
    .map(([code, item]) => `- [${code}] ${item.name} · ${item.kind === "income" ? "renda" : item.kind === "investment" ? "investimento" : "conta fixa"} · ${formatAmount(item.amount)} · vence dia ${item.dayOfMonth}${item.installments ? ` · ${item.installments}x` : ""}${item.categoryName ? ` · ${item.categoryName}` : ""}`)
    .join("\n");
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
- Itens planejados no orçamento: quando um lançamento for o pagamento (ou recebimento) de um deles, preencha "planned" com o código, ex.: débito "VIVO*CONTROLE 40,00" é o pagamento de "Vivo Controle"; salário recebido é a renda planejada. Só relacione quando tiver boa confiança (nome parecido e valor próximo); na dúvida, omita.
- Descrição curta e reconhecível, reaproveitando quando fizer sentido as descrições que a pessoa já usa: ${known || "(ainda nenhuma)"}.

Categorias disponíveis:
${categoryList || "(nenhuma)"}

Itens planejados no orçamento (contas fixas, rendas e investimentos):
${plannedList || "(nenhum)"}`),
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
            plannedId: entry.planned ? (codes.get(entry.planned.trim().toUpperCase())?.id ?? null) : null,
            plannedSource: entry.planned && codes.has(entry.planned.trim().toUpperCase()) ? "ai" : null,
          };
        }),
    })),
    RunnableLambda.from((result: { summary: string; entries: ExtractedEntry[] }) => ({ ...result, entries: matchPlanned(result.entries, plannedItems) })),
    RunnableLambda.from(async (result: { summary: string; entries: ExtractedEntry[] }) => ({ ...result, entries: await markAlreadyAdded(result.entries, plannedItems) })),
  ]);

  try {
    return await pipeline.invoke({});
  } catch (error) {
    console.error(error);
    throw new ApiError(502, "A IA não conseguiu ler esse arquivo agora. Tente de novo em instantes.");
  }
}

function formatAmount(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

// When the model didn't link an entry, an exact amount match with a planned item due around that month is offered as a suggestion.
function matchPlanned(entries: ExtractedEntry[], items: RecurringRow[]) {
  const taken = new Set(entries.filter((e) => e.plannedId && e.date).map((e) => `${e.plannedId}|${monthOf(e.date!)}`));
  return entries.map((entry) => {
    if (entry.plannedId || entry.amount === null || !entry.date) return entry;
    const month = monthOf(entry.date);
    const wantedKind = entry.kind === "income" ? ["income"] : ["expense", "investment"];
    const candidates = items.filter(
      (item) =>
        wantedKind.includes(item.kind) &&
        [month, addMonths(month, -1), addMonths(month, 1)].some((m) => occursIn(item, m) && Math.abs(amountFor(item, m) - entry.amount!) < 0.01) &&
        !taken.has(`${item.id}|${month}`),
    );
    if (candidates.length !== 1) return entry;
    taken.add(`${candidates[0].id}|${month}`);
    return { ...entry, plannedId: candidates[0].id, plannedSource: "amount" as const };
  });
}

// Anything with the same amount within two days of an entry already registered in that interval is marked as already added,
// and so is a link to a planned item that was already marked as paid that month.
async function markAlreadyAdded(entries: ExtractedEntry[], items: RecurringRow[]) {
  if (!entries.length) return entries;
  entries = entries.map((entry) => {
    if (!entry.plannedId || !entry.date) return entry;
    const item = items.find((i) => i.id === entry.plannedId);
    const paid = item ? paymentFor(item, monthOf(entry.date)) : null;
    return paid ? { ...entry, duplicateOf: `${item!.name} já marcado como pago em ${paid.date.slice(8, 10)}/${paid.date.slice(5, 7)}` } : entry;
  });
  const dates = entries.map((e) => e.date).filter((d): d is string => d !== null).sort();
  if (!dates.length) return entries;
  const existing = await db
    .select({ date: transactions.date, amount: transactions.amount, description: transactions.description })
    .from(transactions)
    .where(and(gte(transactions.date, addDays(dates[0], -2)), lte(transactions.date, addDays(dates.at(-1)!, 2))));
  const used = new Set<number>();
  return entries.map((entry) => {
    if (entry.duplicateOf || entry.amount === null || entry.date === null) return entry;
    const { amount, date } = entry;
    const index = existing.findIndex((row, i) => !used.has(i) && Math.abs(row.amount - amount) < 0.005 && Math.abs(daysBetween(row.date, date)) <= 2);
    if (index < 0) return entry;
    used.add(index);
    return { ...entry, duplicateOf: `${existing[index].description} (${existing[index].date.slice(8, 10)}/${existing[index].date.slice(5, 7)})` };
  });
}

// Entries linked to a planned item only mark it as paid (it is already in the budget); the rest become transactions.
export async function createMany(body: unknown) {
  const data = importInput.parse(body);
  if (!data.transactions.length && !data.payments.length) throw new ApiError(422, "Nada para salvar");
  const created = data.transactions.length ? await db.insert(transactions).values(data.transactions).returning({ id: transactions.id }) : [];
  let adjusted = 0;
  for (const payment of data.payments) if ((await registerPayment(payment)).adjusted) adjusted += 1;
  return { created: created.length, linked: data.payments.length, adjusted };
}
