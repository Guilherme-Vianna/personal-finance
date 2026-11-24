import type { PaymentMethod } from "@/db/schema";
import { addMonths, daysInMonth, eachMonth, formatMonth, monthOf, weekdayOf, WEEKDAYS } from "./dates";
import { formatMoney, formatPercent, PAYMENT_METHOD_LABELS } from "./format";

export type InsightRow = {
  date: string;
  description: string;
  amount: number;
  method: PaymentMethod | null;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
};

export type Segment = { color: string; amount: number; label: string };

export function segmentsOf(rows: InsightRow[]): Segment[] {
  const byCategory = new Map<string, Segment>();
  for (const row of rows) {
    const current = byCategory.get(row.categoryId) ?? { color: row.categoryColor, amount: 0, label: row.categoryName };
    current.amount += row.amount;
    byCategory.set(row.categoryId, current);
  }
  return [...byCategory.values()].sort((a, b) => b.amount - a.amount);
}

export function normalizeDescription(description: string) {
  return description
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

export function topDescriptions(rows: InsightRow[], limit = 8) {
  const total = rows.reduce((t, row) => t + row.amount, 0);
  const groups = new Map<string, { label: string; amount: number; count: number; color: string; labels: Map<string, number> }>();
  for (const row of rows) {
    const key = normalizeDescription(row.description);
    const group = groups.get(key) ?? { label: row.description.trim(), amount: 0, count: 0, color: row.categoryColor, labels: new Map() };
    group.amount += row.amount;
    group.count += 1;
    group.labels.set(row.description.trim(), (group.labels.get(row.description.trim()) ?? 0) + 1);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      label: [...group.labels].sort((a, b) => b[1] - a[1])[0][0],
      amount: group.amount,
      count: group.count,
      average: group.amount / group.count,
      color: group.color,
      share: total ? group.amount / total : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

export function byMethod(rows: InsightRow[]) {
  const total = rows.reduce((t, row) => t + row.amount, 0);
  const methods = [...Object.keys(PAYMENT_METHOD_LABELS), null] as (PaymentMethod | null)[];
  return methods
    .map((method) => {
      const own = rows.filter((row) => row.method === method);
      const amount = own.reduce((t, row) => t + row.amount, 0);
      return {
        key: method ?? "none",
        label: method ? PAYMENT_METHOD_LABELS[method].label : "Não informado",
        icon: method ? PAYMENT_METHOD_LABELS[method].icon : "❔",
        amount,
        count: own.length,
        share: total ? amount / total : 0,
      };
    })
    .filter((m) => m.count > 0)
    .sort((a, b) => b.amount - a.amount);
}

export function byWeekday(rows: InsightRow[]) {
  return WEEKDAYS.map((day) => {
    const own = rows.filter((row) => weekdayOf(row.date) === day.value);
    return { key: String(day.value), label: day.short, amount: own.reduce((t, row) => t + row.amount, 0), count: own.length };
  });
}

export function computeInsights(rows: InsightRow[], today: string, windowMonths: number, monthlyBudget: number) {
  const currentMonth = monthOf(today);
  const firstMonth = addMonths(currentMonth, -(windowMonths - 1));
  const previousFirst = addMonths(firstMonth, -windowMonths);
  const months = eachMonth(firstMonth, currentMonth);
  const inWindow = rows.filter((row) => monthOf(row.date) >= firstMonth && monthOf(row.date) <= currentMonth);
  const inPrevious = rows.filter((row) => monthOf(row.date) >= previousFirst && monthOf(row.date) < firstMonth);

  const elapsed = Number(today.slice(8, 10));
  const monthly = months.map((month) => {
    const own = inWindow.filter((row) => monthOf(row.date) === month);
    const amount = own.reduce((t, row) => t + row.amount, 0);
    const projected = month === currentMonth && elapsed > 0 ? (amount / elapsed) * daysInMonth(month) : amount;
    return { key: month, label: formatMonth(month, "short"), amount, projected, count: own.length, segments: segmentsOf(own) };
  });

  const closed = monthly.filter((m) => m.key < currentMonth);
  const closedWithData = closed.filter((m) => m.count > 0);
  const averageMonthly = closedWithData.length ? closedWithData.reduce((t, m) => t + m.amount, 0) / closedWithData.length : 0;
  const total = inWindow.reduce((t, row) => t + row.amount, 0);
  const previousTotal = inPrevious.reduce((t, row) => t + row.amount, 0);
  const current = monthly.at(-1)!;

  const categoryIds = [...new Set([...inWindow, ...inPrevious].map((row) => row.categoryId))];
  const categories = categoryIds
    .map((id) => {
      const own = inWindow.filter((row) => row.categoryId === id);
      const before = inPrevious.filter((row) => row.categoryId === id);
      const sample = own[0] ?? before[0];
      const amount = own.reduce((t, row) => t + row.amount, 0);
      const previous = before.reduce((t, row) => t + row.amount, 0);
      return {
        id,
        name: sample.categoryName,
        color: sample.categoryColor,
        amount,
        previous,
        change: previous ? (amount - previous) / previous : null,
        share: total ? amount / total : 0,
        perMonth: amount / months.length,
        spark: months.map((month) => own.filter((row) => monthOf(row.date) === month).reduce((t, row) => t + row.amount, 0)),
      };
    })
    .filter((c) => c.amount > 0 || c.previous > 0)
    .sort((a, b) => b.amount - a.amount);

  const descriptions = topDescriptions(inWindow);
  const methods = byMethod(inWindow);
  const weekdays = byWeekday(inWindow);
  const small = inWindow.filter((row) => row.amount < 20);
  const smallTotal = small.reduce((t, row) => t + row.amount, 0);

  const insights: { icon: string; text: string }[] = [];
  if (monthlyBudget > 0 && current.count > 0) {
    const ratio = current.projected / monthlyBudget;
    insights.push(
      ratio > 1.05
        ? { icon: "⚠️", text: `No ritmo atual, ${formatMonth(currentMonth)} fecha em ${formatMoney(current.projected, { round: true })}: ${formatPercent(ratio - 1)} acima do orçamento.` }
        : { icon: "✅", text: `No ritmo atual, ${formatMonth(currentMonth)} fecha em ${formatMoney(current.projected, { round: true })}, dentro do orçamento de ${formatMoney(monthlyBudget, { round: true })}.` },
    );
  }
  if (descriptions[0]) {
    const top = descriptions[0];
    insights.push({ icon: "🔁", text: `"${top.label}" é onde mais vai dinheiro: ${formatMoney(top.amount)} em ${top.count} compra(s), média de ${formatMoney(top.average)} cada.` });
  }
  if (small.length >= 5 && total > 0) {
    insights.push({ icon: "🪙", text: `Compras abaixo de R$ 20 somam ${formatMoney(smallTotal)} (${formatPercent(smallTotal / total)} do total) em ${small.length} compras. O pouco que vira muito.` });
  }
  const riser = categories.filter((c) => c.change !== null && c.previous >= 50).sort((a, b) => (b.change ?? 0) - (a.change ?? 0))[0];
  if (riser && (riser.change ?? 0) > 0.2) insights.push({ icon: "📈", text: `${riser.name} subiu ${formatPercent(riser.change!)} em relação aos ${windowMonths} meses anteriores.` });
  const faller = categories.filter((c) => c.change !== null && c.previous >= 50).sort((a, b) => (a.change ?? 0) - (b.change ?? 0))[0];
  if (faller && (faller.change ?? 0) < -0.2) insights.push({ icon: "📉", text: `${faller.name} caiu ${formatPercent(-faller.change!)} em relação aos ${windowMonths} meses anteriores. Boa!` });
  const busiest = [...weekdays].sort((a, b) => b.amount - a.amount)[0];
  if (busiest && busiest.amount > 0 && total > 0) {
    const day = WEEKDAYS.find((d) => String(d.value) === busiest.key)!;
    insights.push({ icon: "📅", text: `${day.label} é o dia em que você mais gasta: ${formatPercent(busiest.amount / total)} do total.` });
  }
  if (methods[0] && methods[0].key === "credit" && methods[0].share > 0.4) {
    insights.push({ icon: "💳", text: `${formatPercent(methods[0].share)} dos gastos foram no crédito. Lembre que eles chegam juntos na fatura.` });
  }

  return {
    months: monthly,
    total,
    previousTotal,
    change: previousTotal ? (total - previousTotal) / previousTotal : null,
    averageMonthly,
    current,
    count: inWindow.length,
    averageTicket: inWindow.length ? total / inWindow.length : 0,
    categories,
    descriptions,
    methods,
    weekdays,
    insights,
  };
}

export type Insights = ReturnType<typeof computeInsights>;
