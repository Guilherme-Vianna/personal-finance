import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, goals, recurring, recurringOverrides } from "@/db/schema";
import { notFound } from "@/lib/api-errors";
import { overrideInput, recurringInput } from "@/lib/validation";

export async function listRecurring() {
  const [rows, overrides] = await Promise.all([
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
  ]);
  return rows.map((row) => ({
    ...row,
    overrides: overrides.filter((o) => o.recurringId === row.id).map(({ month, amount, notes }) => ({ month, amount, notes })),
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
