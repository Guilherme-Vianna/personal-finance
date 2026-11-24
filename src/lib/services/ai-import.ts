import "server-only";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { ApiError } from "@/lib/api-errors";
import { transactionInput } from "@/lib/validation";
import { listCategories } from "./categories";
import { descriptionSuggestions } from "./transactions";

const DEFAULT_MODEL = "gemini-3.8-flash";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const MAX_BYTES = 8 * 1024 * 1024;

const extraction = z.object({
  entries: z.array(
    z.object({
      date: z.string().nullable().describe("YYYY-MM-DD, or null when the image shows no date"),
      description: z.string().describe("Short name of the purchase or income, in Portuguese, as the user would write it"),
      amount: z.number().describe("Positive value in BRL"),
      kind: z.enum(["expense", "income"]),
      method: z.enum(["credit", "debit", "pix", "cash", "voucher"]).nullable(),
      category: z.string().nullable().describe("Exactly one of the given category names, or null"),
      doubt: z.string().nullable().describe("Short note in Portuguese when something is unclear, else null"),
    }),
  ),
  summary: z.string().describe("One short sentence in Portuguese about what the image is"),
});

export type ExtractedEntry = {
  date: string;
  description: string;
  amount: number;
  categoryId: string | null;
  method: z.infer<typeof extraction>["entries"][number]["method"];
  kind: "expense" | "income";
  doubt: string | null;
};

function parseJson(text: string | undefined): unknown {
  try {
    return JSON.parse(text ?? "");
  } catch {
    return null;
  }
}

export function aiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function extractFromImage(file: File, today: string, hint: string | null) {
  if (!aiConfigured()) throw new ApiError(503, "A leitura por IA não está configurada: defina GEMINI_API_KEY.");
  const mediaType = IMAGE_TYPES.find((type) => type === file.type);
  if (!mediaType) throw new ApiError(422, "Envie uma imagem JPG, PNG, WEBP ou GIF.");
  if (file.size > MAX_BYTES) throw new ApiError(422, "Imagem grande demais (máx. 8 MB).");

  const [categories, suggestions] = await Promise.all([listCategories(), descriptionSuggestions()]);
  const categoryList = categories.map((c) => `- ${c.name} (${c.kind === "income" ? "entrada" : "gasto"}${c.description ? `: ${c.description}` : ""})`).join("\n");
  const known = suggestions
    .slice(0, 60)
    .map((s) => s.description)
    .join(", ");

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  let text: string | undefined;
  try {
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
      contents: [
        {
          role: "user",
          parts: [{ inlineData: { mimeType: mediaType, data } }, { text: hint ? `Observação da pessoa: ${hint}` : "Extraia os lançamentos desta imagem." }],
        },
      ],
      config: {
        systemInstruction: `Você lê imagens de comprovantes, notas fiscais, faturas de cartão, extratos bancários e prints de apps de banco de uma pessoa no Brasil e transforma em lançamentos para o app de finanças dela.

Regras:
- Um lançamento por compra/transação. Numa nota fiscal de um único estabelecimento, gere um lançamento só com o total (não item por item), a menos que a pessoa peça o contrário.
- Ignore pagamentos de fatura, transferências entre contas da própria pessoa, estornos já compensados, saldos e limites.
- Valores sempre positivos, em reais. kind = "income" só para dinheiro que entrou (Pix recebido, salário, reembolso).
- Datas no formato YYYY-MM-DD. Hoje é ${today}; quando o ano não aparece, use o mais recente que não fique no futuro.
- Forma de pagamento: credit (cartão de crédito/fatura), debit, pix, cash, voucher (VR/VA/Ticket/Alelo/Sodexo/Caju). null se não der pra saber.
- Categoria: use exatamente um dos nomes da lista, ou null se nenhum servir.
- Descrição curta e reconhecível, reaproveitando quando fizer sentido as descrições que a pessoa já usa: ${known || "(ainda nenhuma)"}.

Categorias disponíveis:
${categoryList || "(nenhuma)"}`,
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(extraction),
        temperature: 0,
      },
    });
    text = response.text;
  } catch (error) {
    console.error(error);
    throw new ApiError(502, "O Gemini não respondeu. Tente de novo em instantes.");
  }
  const result = extraction.safeParse(parseJson(text));
  if (!result.success) throw new ApiError(502, "Não foi possível entender a resposta da IA. Tente de novo.");
  const parsed = result.data;

  const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  const entries: ExtractedEntry[] = parsed.entries
    .filter((entry) => entry.amount > 0 && entry.description.trim())
    .map((entry) => {
      const category = entry.category ? byName.get(entry.category.toLowerCase()) : undefined;
      return {
        date: entry.date && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) ? entry.date : today,
        description: entry.description.trim().slice(0, 120),
        amount: Math.round(entry.amount * 100) / 100,
        kind: entry.kind,
        categoryId: category && category.kind === entry.kind ? category.id : null,
        method: entry.kind === "expense" ? entry.method : null,
        doubt: entry.doubt,
      };
    });
  return { entries, summary: parsed.summary };
}

export async function createMany(body: unknown) {
  const rows = z.array(transactionInput).min(1, "Nada para salvar").max(200).parse(body);
  const created = await db.insert(transactions).values(rows).returning({ id: transactions.id });
  return { created: created.length, ids: created.map((r) => r.id) };
}
