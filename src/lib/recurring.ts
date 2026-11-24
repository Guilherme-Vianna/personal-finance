import type { RecurringKind } from "@/db/schema";
import { dayInMonth, eachMonth, monthOf, monthsBetween } from "./dates";

export type MonthOverride = { month: string; amount: number | null; notes?: string | null };

export type RecurringLike = {
  id: string;
  kind: RecurringKind;
  amount: number;
  dayOfMonth: number;
  startMonth: string;
  endMonth: string | null;
  installments: number | null;
  active: boolean;
  overrides?: MonthOverride[];
};

export function overrideFor(item: Pick<RecurringLike, "overrides">, month: string) {
  return item.overrides?.find((o) => o.month === month) ?? null;
}

// Planned months inside the item's period, before overrides. Skipped months are still part of the plan.
export function plannedMonths(item: RecurringLike, from: string, to: string) {
  if (!item.active) return [];
  const start = from > item.startMonth ? from : item.startMonth;
  const end = item.endMonth && item.endMonth < to ? item.endMonth : to;
  if (start > end) return [];
  return eachMonth(start, end);
}

export function recurringMonths(item: RecurringLike, from: string, to: string) {
  return plannedMonths(item, from, to).filter((month) => overrideFor(item, month)?.amount !== null);
}

export function occursIn(item: RecurringLike, month: string) {
  return recurringMonths(item, month, month).length > 0;
}

export function amountFor(item: RecurringLike, month: string) {
  if (!occursIn(item, month)) return 0;
  return overrideFor(item, month)?.amount ?? item.amount;
}

// Dates on which the item actually happened (or happens) between two days, inclusive.
export function recurringDates(item: RecurringLike, from: string, to: string) {
  return recurringMonths(item, monthOf(from), monthOf(to))
    .map((month) => ({ month, date: dayInMonth(month, item.dayOfMonth), amount: amountFor(item, month) }))
    .filter(({ date }) => date >= from && date <= to);
}

export function installmentOf(item: Pick<RecurringLike, "installments" | "startMonth">, month: string) {
  if (!item.installments) return null;
  const number = monthsBetween(item.startMonth, month) + 1;
  return number >= 1 && number <= item.installments ? number : null;
}

export function recurringStatus(item: RecurringLike, month: string) {
  if (!item.active) return "inactive" as const;
  if (item.startMonth > month) return "scheduled" as const;
  if (item.endMonth && item.endMonth < month) return "ended" as const;
  return "running" as const;
}

export function remainingAmount(item: RecurringLike, month: string) {
  if (!item.endMonth || item.endMonth < month) return null;
  const from = month > item.startMonth ? month : item.startMonth;
  return recurringMonths(item, from, item.endMonth).reduce((total, m) => total + amountFor(item, m), 0);
}
