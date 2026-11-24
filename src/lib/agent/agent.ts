import "server-only";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createAgent, tool, AIMessage, HumanMessage, ToolMessage } from "langchain";
import { formatMonth, monthOf, todayISO } from "@/lib/dates";
import { ApiError } from "@/lib/api-errors";
import { financeTools } from "./tools";

const DEFAULT_MODEL = "gemini-3.8-flash";

export type ChatTurn = { role: "user" | "assistant"; content: string };

function systemPrompt(today: string) {
  return `Você é o assistente financeiro do app "Grana na Vida" de uma pessoa no Brasil. Hoje é ${today} (${formatMonth(monthOf(today))}).

Seu trabalho é analisar os gastos dela e mostrar com clareza para onde o dinheiro está indo e onde dá para economizar.

Regras:
- Sempre consulte as ferramentas antes de citar números. Nunca invente valores, datas ou categorias.
- Use quantas ferramentas forem úteis (ex.: resumo_do_mes + maiores_gastos + comparar_meses) e cruze os dados.
- Responda em português do Brasil, direto e amigável, em Markdown: um título curto (###), listas e **negrito** nos números importantes. Valores no formato R$ 1.234,56.
- Diga sempre o período que você analisou.
- Termine com 2 a 4 sugestões práticas e específicas (ex.: "as 18 Coca-Colas do mês somaram R$ 165; cortar metade economiza ~R$ 80/mês").
- Empréstimos para família são só registro (o dinheiro volta) e não contam como gasto da pessoa.
- Se a pergunta não for sobre as finanças dela, responda brevemente e volte ao tema.`;
}

export async function askAssistant(history: ChatTurn[]) {
  if (!process.env.GEMINI_API_KEY) throw new ApiError(503, "O assistente não está configurado: defina GEMINI_API_KEY.");
  const model = new ChatGoogleGenerativeAI({ model: process.env.GEMINI_MODEL || DEFAULT_MODEL, apiKey: process.env.GEMINI_API_KEY, temperature: 0.2, maxRetries: 2 });
  const tools = financeTools.map((t) =>
    tool(async (input: Record<string, unknown>) => JSON.stringify(await t.run(input)), { name: t.name, description: t.description, schema: t.schema }),
  );
  const agent = createAgent({ model, tools, systemPrompt: systemPrompt(todayISO()) });
  const messages = history.map((turn) => (turn.role === "user" ? new HumanMessage(turn.content) : new AIMessage(turn.content)));

  let result: { messages: unknown[] };
  try {
    result = await agent.invoke({ messages }, { recursionLimit: 20 });
  } catch (error) {
    console.error(error);
    throw new ApiError(502, "O assistente não conseguiu responder agora. Tente de novo em instantes.");
  }
  const produced = result.messages.slice(messages.length);
  const used = [...new Set(produced.filter((m): m is ToolMessage => ToolMessage.isInstance(m)).map((m) => m.name ?? ""))].filter(Boolean);
  const last = [...produced].reverse().find((m): m is AIMessage => AIMessage.isInstance(m) && Boolean(m.text));
  if (!last) throw new ApiError(502, "O assistente não conseguiu montar uma resposta. Tente perguntar de outro jeito.");
  return { reply: last.text, tools: used.map((name) => financeTools.find((t) => t.name === name)?.title ?? name) };
}
