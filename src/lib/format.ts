import type { PaymentMethod, RecurringKind } from "@/db/schema";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const BRL_ROUND = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function formatMoney(value: number, { round = false }: { round?: boolean } = {}) {
  return (round ? BRL_ROUND : BRL).format(value).replace(/ /g, " ");
}

export function formatMoneyShort(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1000) return `${sign}R$ ${(abs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `${sign}R$ ${Math.round(abs)}`;
}

export function formatPercent(ratio: number) {
  return `${Math.round(ratio * 100)}%`;
}

// Accepts "12,50", "12.5", "1.234,56" and "R$ 1.234".
export function parseMoney(input: string) {
  let value = input.replace(/[R$\s]/g, "");
  if (value.includes(",")) value = value.replace(/\./g, "").replace(",", ".");
  const number = Number(value);
  return value && Number.isFinite(number) ? Math.round(number * 100) / 100 : NaN;
}

export function moneyToInput(value: number | null | undefined) {
  if (value === null || value === undefined) return "";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2, useGrouping: false });
}

export function sum<T>(items: T[], pick: (item: T) => number) {
  return items.reduce((total, item) => total + pick(item), 0);
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, { label: string; icon: string }> = {
  credit: { label: "Crédito", icon: "💳" },
  debit: { label: "Débito", icon: "🏧" },
  pix: { label: "Pix", icon: "⚡" },
  cash: { label: "Dinheiro", icon: "💵" },
  voucher: { label: "Ticket", icon: "🎟️" },
};

export const RECURRING_KIND_LABELS: Record<RecurringKind, { label: string; plural: string; icon: string }> = {
  income: { label: "Renda", plural: "Rendas", icon: "💰" },
  expense: { label: "Conta fixa", plural: "Contas fixas", icon: "🧾" },
  investment: { label: "Investimento", plural: "Investimentos", icon: "🐷" },
};

export const CATEGORY_COLORS = [
  "#16a34a",
  "#0d9488",
  "#65a30d",
  "#0891b2",
  "#ca8a04",
  "#ea580c",
  "#dc2626",
  "#db2777",
  "#7c3aed",
  "#2563eb",
  "#475569",
];
