import { addMonths, daysBetween, monthOf, monthsBetween } from "./dates";

export type GoalProgressInput = {
  targetAmount: number;
  deadline: string | null;
  status: "active" | "completed";
  deposits: { date: string; amount: number }[];
};

export type GoalProgress = {
  saved: number;
  remaining: number;
  percent: number;
  depositsCount: number;
  lastDepositDate: string | null;
  monthlyAverage: number;
  thisMonth: number;
  estimatedFinish: string | null;
  monthsLeft: number | null;
  requiredMonthly: number | null;
  pace: "done" | "ahead" | "on-track" | "behind" | "no-data";
};

const PACE_WINDOW_MONTHS = 3;

export function goalProgress(goal: GoalProgressInput, today: string): GoalProgress {
  const deposits = goal.deposits.filter((d) => d.date <= today);
  const saved = deposits.reduce((total, d) => total + d.amount, 0);
  const remaining = Math.max(0, goal.targetAmount - saved);
  const percent = goal.targetAmount > 0 ? Math.max(0, Math.min(100, (saved / goal.targetAmount) * 100)) : 0;

  const currentMonth = monthOf(today);
  const dates = deposits.map((d) => d.date).sort();
  const firstMonth = dates[0] ? monthOf(dates[0]) : currentMonth;
  const windowStart = [firstMonth, addMonths(currentMonth, -(PACE_WINDOW_MONTHS - 1))].sort()[1];
  const windowMonths = monthsBetween(windowStart, currentMonth) + 1;
  const windowAmount = deposits.filter((d) => monthOf(d.date) >= windowStart).reduce((t, d) => t + d.amount, 0);
  const monthlyAverage = windowAmount / windowMonths;
  const thisMonth = deposits.filter((d) => monthOf(d.date) === currentMonth).reduce((t, d) => t + d.amount, 0);

  const estimatedFinish = remaining === 0 ? null : monthlyAverage > 0 ? `${addMonths(currentMonth, Math.ceil(remaining / monthlyAverage))}-01` : null;
  const monthsLeft = goal.deadline ? Math.max(0, monthsBetween(currentMonth, monthOf(goal.deadline))) + (daysBetween(today, goal.deadline) >= 0 ? 1 : 0) : null;
  const requiredMonthly = goal.deadline && remaining > 0 ? remaining / Math.max(1, monthsLeft ?? 1) : null;

  let pace: GoalProgress["pace"] = "no-data";
  if (remaining === 0 || goal.status === "completed") pace = "done";
  else if (requiredMonthly !== null) pace = monthlyAverage >= requiredMonthly * 1.1 ? "ahead" : monthlyAverage >= requiredMonthly * 0.9 ? "on-track" : "behind";
  else if (monthlyAverage > 0) pace = "on-track";

  return {
    saved,
    remaining,
    percent,
    depositsCount: deposits.length,
    lastDepositDate: dates.at(-1) ?? null,
    monthlyAverage,
    thisMonth,
    estimatedFinish,
    monthsLeft,
    requiredMonthly,
    pace,
  };
}

export const PACE_LABELS: Record<GoalProgress["pace"], { label: string; tone: string }> = {
  done: { label: "Meta batida", tone: "bg-brand-100 text-brand-800" },
  ahead: { label: "Adiantada", tone: "bg-brand-100 text-brand-800" },
  "on-track": { label: "No ritmo", tone: "bg-sky-100 text-sky-800" },
  behind: { label: "Atrasada", tone: "bg-amber-100 text-amber-800" },
  "no-data": { label: "Sem depósitos recentes", tone: "bg-slate-100 text-slate-600" },
};
