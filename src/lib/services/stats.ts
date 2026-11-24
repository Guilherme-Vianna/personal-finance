import "server-only";
import { monthSummary } from "@/lib/budget";
import { addMonths, dayInMonth, eachDay, lastDayOfMonth, monthOf } from "@/lib/dates";
import { byMethod, byWeekday, computeInsights, segmentsOf, topDescriptions } from "@/lib/insights";
import { amountFor, installmentOf, overrideFor, plannedMonths } from "@/lib/recurring";
import { listCategories } from "./categories";
import { listRecurring } from "./recurring";
import { getSettings } from "./settings";
import { listTransactions } from "./transactions";

export async function dashboardStats({ month, includeOutside, today }: { month: string; includeOutside: boolean; today: string }) {
  const from = `${month}-01`;
  const to = lastDayOfMonth(month);
  const [settings, recurringItems, rows, categories] = await Promise.all([getSettings(), listRecurring(), listTransactions({ from, to, limit: 100_000 }), listCategories()]);

  const summary = monthSummary({ month, today, settings, recurring: recurringItems, transactions: rows });
  const expenses = rows.filter((row) => row.categoryKind === "expense" && (includeOutside || !row.outsideBudget));
  const total = expenses.reduce((t, row) => t + row.amount, 0);

  const byCategory = categories
    .map((category) => {
      const own = expenses.filter((row) => row.categoryId === category.id);
      const amount = own.reduce((t, row) => t + row.amount, 0);
      return { id: category.id, name: category.name, color: category.color, outsideBudget: category.outsideBudget, amount, count: own.length, percent: total ? amount / total : 0 };
    })
    .filter((category) => category.count > 0)
    .sort((a, b) => b.amount - a.amount);

  const lastDay = month === monthOf(today) ? today : to;
  let running = 0;
  const series = eachDay(from, to).map((day) => {
    const own = expenses.filter((row) => row.date === day);
    const amount = own.reduce((t, row) => t + row.amount, 0);
    running += amount;
    return { key: day, label: `${day.slice(8, 10)}/${day.slice(5, 7)}`, amount, cumulative: day <= lastDay ? running : null, segments: segmentsOf(own), future: day > lastDay };
  });

  const bills = recurringItems
    .filter((item) => plannedMonths(item, month, month).length > 0)
    .map((item) => {
      const override = overrideFor(item, month);
      return { ...item, date: dayInMonth(month, item.dayOfMonth), installment: installmentOf(item, month), monthAmount: amountFor(item, month), override };
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.monthAmount - a.monthAmount));

  return {
    month,
    summary,
    total,
    count: expenses.length,
    byCategory,
    topCategory: byCategory[0] ?? null,
    series,
    byWeekday: byWeekday(expenses),
    byMethod: byMethod(expenses),
    topDescriptions: topDescriptions(expenses, 5),
    bills,
  };
}

export type DashboardStats = Awaited<ReturnType<typeof dashboardStats>>;

export async function insightsStats({ windowMonths, includeOutside, today }: { windowMonths: number; includeOutside: boolean; today: string }) {
  const from = `${addMonths(monthOf(today), -(windowMonths * 2 - 1))}-01`;
  const [rows, settings] = await Promise.all([listTransactions({ from, to: today, kind: "expense", limit: 100_000 }), getSettings()]);
  return computeInsights(includeOutside ? rows : rows.filter((row) => !row.outsideBudget), today, windowMonths, settings.personalBudget);
}
