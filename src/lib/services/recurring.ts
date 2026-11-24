import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, goals, recurring, recurringOverrides, recurringPayments } from "@/db/schema";
import { notFound } from "@/lib/api-errors";
import { monthOf } from "@/lib/dates";
import { amountFor } from "@/lib/recurring";
import { overrideInput, paymentInput, recurringInput } from "@/lib/validation";

export async function listRecurring() {
  const [rows, overrides, payments] = await Promise.all([
    db
      .select({
        id: recurring.id,
        name: recurring.name,
        kind: recurring.kind,
        categoryId: recurring.categoryId,
        goalId: recurring.goalId,
        amount: recurring.amount,
        dayOfMonth: recurring.dayOfMonth,
        startMonth: recurring.startMonth,
        endMonth: recurring.endMonth,
        installments: recurring.installments,
        lentTo: recurring.lentTo,
        notes: recurring.notes,
        active: recurring.active,
        categoryName: categories.name,
        categoryColor: categories.color,
        goalName: goals.name,
        goalColor: goals.color,
      })
      .from(recurring)
      .leftJoin(categories, eq(categories.id, recurring.categoryId))
      .leftJoin(goals, eq(goals.id, recurring.goalId))
      .orderBy(asc(recurring.name)),
    db
      .select({ recurringId: recurringOverrides.recurringId, month: recurringOverrides.month, amount: recurringOverrides.amount, notes: recurringOverrides.notes })
      .from(recurringOverrides)
      .orderBy(asc(recurringOverrides.month)),
    db
      .select({ recurringId: recurringPayments.recurringId, month: recurringPayments.month, date: recurringPayments.date, amount: recurringPayments.amount, description: recurringPayments.description })
      .from(recurringPayments)
      .orderBy(asc(recurringPayments.month)),
  ]);
  return rows.map((row) => ({
    ...row,
    overrides: overrides.filter((o) => o.recurringId === row.id).map(({ month, amount, notes }) => ({ month, amount, notes })),
    payments: payments.filter((p) => p.recurringId === row.id).map(({ month, date, amount, description }) => ({ month, date, amount, description })),
  }));
}

export type RecurringRow = Awaited<ReturnType<typeof listRecurring>>[number];

export async function createRecurring(body: unknown) {
  const data = recurringInput.parse(body);
  const [created] = await db.insert(recurring).values(data).returning();
  return created;
}

export async function updateRecurring(id: string, body: unknown) {
  const data = recurringInput.parse(body);
  const [updated] = await db.update(recurring).set(data).where(eq(recurring.id, id)).returning();
  if (!updated) throw notFound("Item do orçamento");
  return updated;
}

export async function deleteRecurring(id: string) {
  const deleted = await db.delete(recurring).where(eq(recurring.id, id)).returning({ id: recurring.id });
  if (!deleted.length) throw notFound("Item do orçamento");
}

export async function setOverride(recurringId: string, body: unknown) {
  const data = overrideInput.parse(body);
  const [item] = await db.select({ id: recurring.id }).from(recurring).where(eq(recurring.id, recurringId));
  if (!item) throw notFound("Item do orçamento");
  const [row] = await db
    .insert(recurringOverrides)
    .values({ recurringId, ...data })
    .onConflictDoUpdate({ target: [recurringOverrides.recurringId, recurringOverrides.month], set: { amount: data.amount, notes: data.notes } })
    .returning();
  return row;
}

export async function deleteOverride(recurringId: string, month: string) {
  await db.delete(recurringOverrides).where(and(eq(recurringOverrides.recurringId, recurringId), eq(recurringOverrides.month, month)));
}

// Marks a planned item as paid/received in the month of `date`. A different amount becomes that month's override,
// so totals follow what really happened.
export async function registerPayment(body: unknown) {
  const data = paymentInput.parse(body);
  const items = await listRecurring();
  const item = items.find((i) => i.id === data.recurringId);
  if (!item) throw notFound("Item do orçamento");
  const month = monthOf(data.date);
  await db
    .insert(recurringPayments)
    .values({ recurringId: item.id, month, date: data.date, amount: data.amount, description: data.description })
    .onConflictDoUpdate({ target: [recurringPayments.recurringId, recurringPayments.month], set: { date: data.date, amount: data.amount, description: data.description } });
  const planned = amountFor(item, month) || item.amount;
  const adjusted = Math.abs(planned - data.amount) >= 0.01;
  if (adjusted) {
    await db
      .insert(recurringOverrides)
      .values({ recurringId: item.id, month, amount: data.amount, notes: "Valor real (importado)" })
      .onConflictDoUpdate({ target: [recurringOverrides.recurringId, recurringOverrides.month], set: { amount: data.amount, notes: "Valor real (importado)" } });
  }
  return { recurringId: item.id, month, adjusted };
}

export async function deletePayment(recurringId: string, month: string) {
  await db.delete(recurringPayments).where(and(eq(recurringPayments.recurringId, recurringId), eq(recurringPayments.month, month)));
}
