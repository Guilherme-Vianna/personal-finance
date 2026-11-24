import type { CategoryKind } from "@/db/schema";
import { daysInMonth, monthOf } from "./dates";
import { amountFor, occursIn, type RecurringLike } from "./recurring";

export type BudgetSettings = {
  personalBudget: number;
  splitEssentials: number;
  splitPersonal: number;
  splitInvestments: number;
};

export type BudgetTransaction = { date: string; amount: number; categoryKind: CategoryKind; outsideBudget: boolean; lentTo?: string | null };

// Mirrors the "Orçamento" sheet: fixed income minus fixed bills, personal budget and investments is the
// planned leftover; the personal budget (plus extra income) minus what was spent is what is left to spend.
export function monthSummary({
  month,
  today,
  settings,
  recurring,
  transactions,
  repayments = [],
}: {
  month: string;
  today: string;
  settings: BudgetSettings;
  recurring: RecurringLike[];
  transactions: BudgetTransaction[];
  repayments?: { date: string; amount: number }[];
}) {
  const own = recurring.filter((item) => occursIn(item, month));
  const total = (rows: RecurringLike[]) => rows.reduce((t, item) => t + amountFor(item, month), 0);
  const fixedIncome = total(own.filter((item) => item.kind === "income"));
  const fixedExpenses = total(own.filter((item) => item.kind === "expense" && !item.lentTo));
  const lentInstallments = total(own.filter((item) => item.kind === "expense" && item.lentTo));
  const investments = total(own.filter((item) => item.kind === "investment"));

  const inMonth = transactions.filter((t) => monthOf(t.date) === month);
  const add = (rows: BudgetTransaction[]) => rows.reduce((t, row) => t + row.amount, 0);
  const extraIncome = add(inMonth.filter((t) => t.categoryKind === "income"));
  const budgetExtra = add(inMonth.filter((t) => t.categoryKind === "income" && !t.outsideBudget));
  const spent = add(inMonth.filter((t) => t.categoryKind === "expense" && !t.outsideBudget && !t.lentTo));
  const spentOutside = add(inMonth.filter((t) => t.categoryKind === "expense" && t.outsideBudget && !t.lentTo));
  const lentSpent = add(inMonth.filter((t) => t.categoryKind === "expense" && t.lentTo));
  const lent = lentInstallments + lentSpent;
  const repaid = repayments.filter((r) => monthOf(r.date) === month).reduce((t, r) => t + r.amount, 0);

  const personalBudget = settings.personalBudget + budgetExtra;
  const remaining = personalBudget - spent;

  const days = daysInMonth(month);
  const currentMonth = monthOf(today);
  const elapsedDays = month < currentMonth ? days : month > currentMonth ? 0 : Number(today.slice(8, 10));
  const daysLeft = month < currentMonth ? 0 : month > currentMonth ? days : days - elapsedDays + 1;
  // Today still counts as a day to spend in, so the expected pace uses the days before today.
  const pacedDays = month === currentMonth ? elapsedDays - 1 : elapsedDays;
  const idealSpent = (personalBudget * pacedDays) / days;

  const income = fixedIncome + extraIncome;
  const plannedLeftover = income - fixedExpenses - lentInstallments - settings.personalBudget - investments;
  const actualLeftover = income + repaid - fixedExpenses - investments - spent - spentOutside - lent;

  const split = [
    { key: "essentials", label: "Contas fixas", percent: settings.splitEssentials, actual: fixedExpenses },
    { key: "personal", label: "Gastos pessoais", percent: settings.splitPersonal, actual: settings.personalBudget },
    { key: "investments", label: "Investimentos", percent: settings.splitInvestments, actual: investments },
  ].map((slice) => {
    const ideal = (income * slice.percent) / 100;
    return { ...slice, ideal, free: ideal - slice.actual, share: income ? slice.actual / income : 0 };
  });

  return {
    month,
    fixedIncome,
    extraIncome,
    income,
    fixedExpenses,
    investments,
    personalBudget,
    budgetExtra,
    spent,
    spentOutside,
    lent,
    lentInstallments,
    repaid,
    remaining,
    usedPercent: personalBudget > 0 ? (spent / personalBudget) * 100 : spent > 0 ? 100 : 0,
    idealPercent: (pacedDays / days) * 100,
    paceDiff: spent - idealSpent,
    days,
    daysLeft,
    dailyAllowance: daysLeft > 0 ? Math.max(0, remaining) / daysLeft : 0,
    dailyAverage: elapsedDays > 0 ? spent / elapsedDays : 0,
    plannedLeftover,
    actualLeftover,
    split,
    recurringCount: own.length,
  };
}

export type MonthSummary = ReturnType<typeof monthSummary>;
