import { z } from "zod";
import { CATEGORY_KINDS, PAYMENT_METHODS, RECURRING_KINDS } from "@/db/schema";
import { addMonths } from "./dates";

const isoDate = z.iso.date({ error: "Data inválida" });
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês inválido");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);
const amount = z.coerce.number({ error: "Informe o valor" }).gt(0, "Precisa ser maior que zero").max(10_000_000, "Valor alto demais");
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida");
const optionalId = z.uuid().nullish().transform((value) => value ?? null);

export const categoryInput = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(60),
  description: optionalText(300),
  color: color.default("#2563eb"),
  kind: z.enum(CATEGORY_KINDS).default("expense"),
  outsideBudget: z.boolean().default(false),
});

export const transactionInput = z.object({
  date: isoDate,
  description: z.string().trim().min(1, "Informe a descrição").max(120),
  amount,
  categoryId: z.uuid("Escolha uma categoria"),
  method: z.enum(PAYMENT_METHODS).nullish().transform((value) => value ?? null),
  lentTo: optionalText(60),
  notes: optionalText(500),
});

export const recurringInput = z
  .object({
    name: z.string().trim().min(1, "Informe o nome").max(120),
    kind: z.enum(RECURRING_KINDS),
    categoryId: optionalId,
    goalId: optionalId,
    amount,
    dayOfMonth: z.coerce.number().int().min(1, "Entre 1 e 31").max(31, "Entre 1 e 31").default(1),
    startMonth: month,
    endMonth: month.nullish().transform((value) => value ?? null),
    installments: z.coerce.number().int().min(2, "Ao menos 2 parcelas").max(480).nullish().transform((value) => value ?? null),
    lentTo: optionalText(60),
    notes: optionalText(300),
    active: z.boolean().default(true),
  })
  .refine((item) => item.kind === "investment" || item.categoryId, { path: ["categoryId"], message: "Escolha uma categoria" })
  .refine((item) => !item.endMonth || item.endMonth >= item.startMonth, { path: ["endMonth"], message: "O fim precisa ser depois do início" })
  .transform((item) => ({
    ...item,
    goalId: item.kind === "investment" ? item.goalId : null,
    lentTo: item.kind === "expense" ? item.lentTo : null,
    endMonth: item.installments ? addMonths(item.startMonth, item.installments - 1) : item.endMonth,
  }));

export const overrideInput = z
  .object({
    month,
    skip: z.boolean().default(false),
    amount: z.coerce.number().gt(0, "Precisa ser maior que zero").max(10_000_000).nullish(),
    notes: optionalText(300),
  })
  .refine((o) => o.skip || (o.amount !== null && o.amount !== undefined), { path: ["amount"], message: "Informe o valor deste mês" })
  .transform((o) => ({ month: o.month, amount: o.skip ? null : (o.amount ?? null), notes: o.notes }));

export const repaymentInput = z.object({
  person: z.string().trim().min(1, "Informe quem pagou").max(60),
  date: isoDate,
  amount,
  notes: optionalText(300),
});

export const paymentInput = z.object({
  recurringId: z.uuid("Escolha o item do orçamento"),
  date: isoDate,
  amount,
  description: optionalText(120),
});

export const importInput = z.object({
  transactions: z.array(transactionInput).max(500).default([]),
  payments: z.array(paymentInput).max(500).default([]),
});

export const goalInput = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(100),
  description: optionalText(1000),
  targetAmount: amount,
  deadline: isoDate.nullish().transform((value) => value ?? null),
  status: z.enum(["active", "completed"]).default("active"),
  color: color.default("#2563eb"),
});

export const depositInput = z.object({
  date: isoDate,
  amount: z.coerce
    .number({ error: "Informe o valor" })
    .refine((value) => value !== 0, "Não pode ser zero")
    .refine((value) => Math.abs(value) <= 10_000_000, "Valor alto demais"),
  notes: optionalText(300),
});

const percent = z.coerce.number().int().min(0).max(100);

export const settingsInput = z
  .object({
    personalBudget: z.coerce.number().min(0, "Não pode ser negativo").max(10_000_000),
    splitEssentials: percent,
    splitPersonal: percent,
    splitInvestments: percent,
  })
  .refine((s) => s.splitEssentials + s.splitPersonal + s.splitInvestments === 100, { path: ["splitInvestments"], message: "As três fatias precisam somar 100%" });

export type CategoryInput = z.infer<typeof categoryInput>;
export type TransactionInput = z.infer<typeof transactionInput>;
export type RecurringInput = z.infer<typeof recurringInput>;
export type GoalInput = z.infer<typeof goalInput>;
export type SettingsInput = z.infer<typeof settingsInput>;
