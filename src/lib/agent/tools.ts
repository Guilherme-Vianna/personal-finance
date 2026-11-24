import "server-only";
import { z } from "zod";
import { monthSummary } from "@/lib/budget";
import { addMonths, isMonth, lastDayOfMonth, monthOf, todayISO } from "@/lib/dates";
import { byMethod, byWeekday, computeInsights, topDescriptions } from "@/lib/insights";
import { amountFor, checkStatus, installmentOf, paymentFor, plannedMonths } from "@/lib/recurring";
import { listCategories } from "@/lib/services/categories";
import { listGoals } from "@/lib/services/goals";
import { listLoans, listRepayments } from "@/lib/services/loans";
import { listRecurring } from "@/lib/services/recurring";
import { getSettings } from "@/lib/services/settings";
import { listTransactions } from "@/lib/services/transactions";

// Read-only analysis tools, shared by the MCP server (/api/mcp) and the in-app agent (/assistente).
// Gemini function schemas have no union types: optional fields only, never nullable.

const money = (value: number) => Math.round(value * 100) / 100;
const pct = (ratio: number) => Math.round(ratio * 1000) / 10;
const monthParam = z.string().optional().describe("Mês no formato YYYY-MM. Padrão: mês atual.");
const dateParam = (what: string) => z.string().optional().describe(`${what} no formato YYYY-MM-DD.`);

function resolveMonth(month: string | undefined) {
  return month && isMonth(month) ? month : monthOf(todayISO());
}

function range(from: string | undefined, to: string | undefined) {
  const today = todayISO();
  return { from: from ?? `${monthOf(today)}-01`, to: to ?? today };
}

const ownExpenses = <T extends { categoryKind: string; lentTo: string | null; outsideBudget: boolean }>(rows: T[], includeOutside = true) =>
  rows.filter((row) => row.categoryKind === "expense" && !row.lentTo && (includeOutside || !row.outsideBudget));

export type FinanceTool = {
  name: string;
  title: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  run: (input: Record<string, unknown>) => Promise<unknown>;
};

function defineTool<S extends z.ZodRawShape>(tool: { name: string; title: string; description: string; schema: z.ZodObject<S>; run: (input: z.infer<z.ZodObject<S>>) => Promise<unknown> }): FinanceTool {
  return tool as unknown as FinanceTool;
}

export const financeTools: FinanceTool[] = [
  defineTool({
    name: "resumo_do_mes",
    title: "Resumo do mês",
    description:
      "Visão geral de um mês: renda, contas fixas, investimentos, orçamento pessoal, quanto já foi gasto, quanto resta, gasto diário permitido, ritmo em relação ao ideal, sobra planejada e real, divisão ideal da renda (ex.: 50/20/30).",
    schema: z.object({ month: monthParam }),
    async run({ month }) {
      const m = resolveMonth(month);
      const today = todayISO();
      const [settings, recurring, rows, repayments] = await Promise.all([
        getSettings(),
        listRecurring(),
        listTransactions({ from: `${m}-01`, to: lastDayOfMonth(m), limit: 100_000 }),
        listRepayments({ from: `${m}-01`, to: lastDayOfMonth(m) }),
      ]);
      const s = monthSummary({ month: m, today, settings, recurring, transactions: rows, repayments });
      return {
        mes: m,
        renda: money(s.income),
        renda_extra: money(s.extraIncome),
        contas_fixas: money(s.fixedExpenses),
        investimentos: money(s.investments),
        orcamento_pessoal: money(s.personalBudget),
        gasto_pessoal: money(s.spent),
        gasto_fora_do_orcamento: money(s.spentOutside),
        restante_do_orcamento: money(s.remaining),
        percentual_usado: Math.round(s.usedPercent),
        percentual_ideal_ate_ontem: Math.round(s.idealPercent),
        diferenca_para_o_ritmo_ideal: money(s.paceDiff),
        dias_restantes: s.daysLeft,
        pode_gastar_por_dia: money(s.dailyAllowance),
        media_gasta_por_dia: money(s.dailyAverage),
        sobra_planejada: money(s.plannedLeftover),
        sobra_real: money(s.actualLeftover),
        emprestado_no_mes_so_registro: money(s.lent),
        divisao_da_renda: s.split.map((x) => ({ fatia: x.label, ideal_percentual: x.percent, ideal: money(x.ideal), atual: money(x.actual), livre: money(x.free) })),
      };
    },
  }),
  defineTool({
    name: "gastos_por_categoria",
    title: "Gastos por categoria",
    description: "Total gasto por categoria num período (padrão: mês atual até hoje), com participação percentual e número de compras. Empréstimos não entram.",
    schema: z.object({ from: dateParam("Data inicial"), to: dateParam("Data final"), incluir_fora_do_orcamento: z.boolean().optional() }),
    async run({ from, to, incluir_fora_do_orcamento }) {
      const r = range(from, to);
      const rows = ownExpenses(await listTransactions({ ...r, limit: 100_000 }), incluir_fora_do_orcamento ?? true);
      const total = rows.reduce((t, row) => t + row.amount, 0);
      const groups = new Map<string, { categoria: string; total: number; compras: number; fora_do_orcamento: boolean }>();
      for (const row of rows) {
        const g = groups.get(row.categoryName) ?? { categoria: row.categoryName, total: 0, compras: 0, fora_do_orcamento: row.outsideBudget };
        g.total += row.amount;
        g.compras += 1;
        groups.set(row.categoryName, g);
      }
      return {
        periodo: r,
        total: money(total),
        categorias: [...groups.values()].sort((a, b) => b.total - a.total).map((g) => ({ ...g, total: money(g.total), percentual: pct(total ? g.total / total : 0) })),
      };
    },
  }),
  defineTool({
    name: "maiores_gastos",
    title: "Maiores gastos",
    description:
      "Onde o dinheiro mais vai num período: descrições agrupadas (ex.: 'Coca Cola' somando todas as compras), as maiores compras individuais, compras pequenas (abaixo de R$ 20), gastos por forma de pagamento e por dia da semana.",
    schema: z.object({ from: dateParam("Data inicial"), to: dateParam("Data final"), limite: z.number().int().min(1).max(30).optional() }),
    async run({ from, to, limite }) {
      const r = range(from, to);
      const rows = ownExpenses(await listTransactions({ ...r, limit: 100_000 }));
      const total = rows.reduce((t, row) => t + row.amount, 0);
      const small = rows.filter((row) => row.amount < 20);
      return {
        periodo: r,
        total: money(total),
        compras: rows.length,
        mais_frequentes: topDescriptions(rows, limite ?? 10).map((d) => ({ descricao: d.label, total: money(d.amount), vezes: d.count, media: money(d.average), percentual: pct(d.share) })),
        maiores_compras: [...rows]
          .sort((a, b) => b.amount - a.amount)
          .slice(0, limite ?? 10)
          .map((row) => ({ data: row.date, descricao: row.description, valor: money(row.amount), categoria: row.categoryName })),
        compras_pequenas: { total: money(small.reduce((t, row) => t + row.amount, 0)), quantidade: small.length, percentual: pct(total ? small.reduce((t, row) => t + row.amount, 0) / total : 0) },
        por_forma_de_pagamento: byMethod(rows).map((m) => ({ forma: m.label, total: money(m.amount), percentual: pct(m.share) })),
        por_dia_da_semana: byWeekday(rows).map((d) => ({ dia: d.label, total: money(d.amount), compras: d.count })),
      };
    },
  }),
  defineTool({
    name: "comparar_meses",
    title: "Comparar meses",
    description:
      "Evolução dos gastos pessoais mês a mês numa janela (3, 6 ou 12 meses), com projeção do mês atual, média dos meses fechados, variação contra a janela anterior e tendência por categoria.",
    schema: z.object({ meses: z.number().int().min(2).max(24).optional().describe("Tamanho da janela em meses. Padrão: 6.") }),
    async run({ meses }) {
      const window = meses ?? 6;
      const today = todayISO();
      const from = `${addMonths(monthOf(today), -(window * 2 - 1))}-01`;
      const [rows, settings] = await Promise.all([listTransactions({ from, to: today, kind: "expense", limit: 100_000 }), getSettings()]);
      const data = computeInsights(ownExpenses(rows, false), today, window, settings.personalBudget);
      return {
        orcamento_pessoal_mensal: money(settings.personalBudget),
        meses: data.months.map((m) => ({ mes: m.key, gasto: money(m.amount), projecao: money(m.projected), compras: m.count })),
        media_meses_fechados: money(data.averageMonthly),
        total_janela: money(data.total),
        total_janela_anterior: money(data.previousTotal),
        variacao_percentual: data.change === null ? undefined : pct(data.change),
        categorias: data.categories.map((c) => ({ categoria: c.name, total: money(c.amount), anterior: money(c.previous), variacao_percentual: c.change === null ? undefined : pct(c.change), por_mes: money(c.perMonth) })),
      };
    },
  }),
  defineTool({
    name: "buscar_lancamentos",
    title: "Buscar lançamentos",
    description: "Lista lançamentos (gastos e entradas) com filtros: texto na descrição/observação, categoria (nome) e período. Use para perguntas como 'quanto gastei com Uber'.",
    schema: z.object({
      texto: z.string().optional(),
      categoria: z.string().optional().describe("Nome da categoria"),
      from: dateParam("Data inicial"),
      to: dateParam("Data final"),
      limite: z.number().int().min(1).max(200).optional(),
    }),
    async run({ texto, categoria, from, to, limite }) {
      const categories = categoria ? await listCategories() : [];
      const category = categoria ? categories.find((c) => c.name.toLowerCase() === categoria.toLowerCase()) : undefined;
      if (categoria && !category) return { erro: `Categoria "${categoria}" não existe`, categorias_disponiveis: categories.map((c) => c.name) };
      const rows = await listTransactions({ from: from ?? null, to: to ?? null, q: texto ?? null, categoryId: category?.id ?? null, limit: 100_000 });
      const expenses = rows.filter((r) => r.categoryKind === "expense");
      return {
        encontrados: rows.length,
        total_gastos: money(expenses.reduce((t, r) => t + r.amount, 0)),
        total_entradas: money(rows.filter((r) => r.categoryKind === "income").reduce((t, r) => t + r.amount, 0)),
        lancamentos: rows.slice(0, limite ?? 50).map((r) => ({
          data: r.date,
          descricao: r.description,
          valor: money(r.amount),
          tipo: r.categoryKind === "income" ? "entrada" : "gasto",
          categoria: r.categoryName,
          forma: r.method ?? undefined,
          emprestado_para: r.lentTo ?? undefined,
        })),
      };
    },
  }),
  defineTool({
    name: "contas_programadas",
    title: "Contas programadas",
    description:
      "Rendas, contas fixas (com parcelas) e investimentos programados no orçamento para um mês, com o valor do mês e a situação: pago/relacionado, pendente, atrasado ou pulado. Também mostra o total de parcelas que ainda faltam pagar.",
    schema: z.object({ month: monthParam }),
    async run({ month }) {
      const m = resolveMonth(month);
      const today = todayISO();
      const items = (await listRecurring()).filter((item) => plannedMonths(item, m, m).length > 0);
      const status = { paid: "pago", pending: "pendente", overdue: "atrasado", skipped: "pulado" } as const;
      return {
        mes: m,
        itens: items.map((item) => {
          const installment = installmentOf(item, m);
          const payment = paymentFor(item, m);
          return {
            nome: item.name,
            tipo: item.kind === "income" ? "renda" : item.kind === "investment" ? "investimento" : "conta fixa",
            valor_no_mes: money(amountFor(item, m)),
            valor_normal: money(item.amount),
            vence_dia: item.dayOfMonth,
            categoria: item.categoryName ?? undefined,
            parcela: installment ? `${installment}/${item.installments}` : undefined,
            termina_em: item.endMonth ?? undefined,
            situacao: item.lentTo ? "emprestado (só registro)" : status[checkStatus(item, m, today)],
            pago_em: payment?.date,
            valor_pago: payment ? money(payment.amount) : undefined,
          };
        }),
      };
    },
  }),
  defineTool({
    name: "metas",
    title: "Metas",
    description: "Metas de dinheiro guardado: valor-alvo, quanto já foi guardado, percentual, média mensal, previsão e quanto guardar por mês para bater o prazo.",
    schema: z.object({}),
    async run() {
      const goals = await listGoals(todayISO());
      return goals.map((g) => ({
        meta: g.name,
        alvo: money(g.targetAmount),
        guardado: money(g.progress.saved),
        percentual: Math.round(g.progress.percent),
        media_mensal: money(g.progress.monthlyAverage),
        prazo: g.deadline ?? undefined,
        previsao: g.progress.estimatedFinish ?? undefined,
        precisa_por_mes: g.progress.requiredMonthly === null ? undefined : money(g.progress.requiredMonthly),
        concluida: g.status === "completed",
      }));
    },
  }),
  defineTool({
    name: "emprestimos",
    title: "Empréstimos",
    description: "Dinheiro e parcelas emprestados para outras pessoas: quanto foi emprestado, devolvido, saldo a receber e parcelas futuras, por pessoa. É só registro: não entra no orçamento.",
    schema: z.object({}),
    async run() {
      const loans = await listLoans(todayISO());
      return loans.map((l) => ({ pessoa: l.name, emprestado: money(l.lent), devolvido: money(l.repaid), a_receber: money(l.balance), parcelas_futuras: money(l.upcoming) }));
    },
  }),
  defineTool({
    name: "categorias",
    title: "Categorias",
    description: "Lista as categorias (gasto ou entrada, se ficam fora do orçamento) com total histórico e número de lançamentos.",
    schema: z.object({}),
    async run() {
      const categories = await listCategories();
      return categories.map((c) => ({ categoria: c.name, tipo: c.kind === "income" ? "entrada" : "gasto", fora_do_orcamento: c.outsideBudget, total_historico: money(c.totalAmount), lancamentos: c.transactionsCount }));
    },
  }),
];
