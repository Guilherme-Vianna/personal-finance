import "server-only";
import { and, asc, count, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, recurring, transactions } from "@/db/schema";
import { ApiError, isUniqueViolation, notFound } from "@/lib/api-errors";
import { categoryInput } from "@/lib/validation";

export async function listCategories() {
  const rows = await db
    .select({
      category: categories,
      transactionsCount: count(transactions.id),
      totalAmount: sql<number>`coalesce(sum(${transactions.amount}), 0)`.mapWith(Number),
      recurringCount: sql<number>`(select count(*) from ${recurring} where ${recurring.categoryId} = ${categories.id})`.mapWith(Number),
    })
    .from(categories)
    .leftJoin(transactions, eq(transactions.categoryId, categories.id))
    .groupBy(categories.id)
    .orderBy(asc(categories.name));
  return rows.map((row) => ({ ...row.category, transactionsCount: row.transactionsCount, totalAmount: row.totalAmount, recurringCount: row.recurringCount }));
}

export type CategoryWithStats = Awaited<ReturnType<typeof listCategories>>[number];

function duplicateName(): never {
  throw new ApiError(409, "Já existe uma categoria com esse nome", { name: "Já existe uma categoria com esse nome" });
}

export async function createCategory(body: unknown) {
  const data = categoryInput.parse(body);
  try {
    const [created] = await db.insert(categories).values(data).returning();
    return created;
  } catch (error) {
    if (isUniqueViolation(error)) duplicateName();
    throw error;
  }
}

export async function updateCategory(id: string, body: unknown) {
  const data = categoryInput.parse(body);
  try {
    const [updated] = await db.update(categories).set(data).where(eq(categories.id, id)).returning();
    if (!updated) throw notFound("Categoria");
    return updated;
  } catch (error) {
    if (isUniqueViolation(error)) duplicateName();
    throw error;
  }
}

// Entries and budget items that used the category are kept as orphans (category set to null) for the user to recategorize.
export async function deleteCategory(id: string) {
  const [[{ transactions: orphanedTransactions }], [{ recurring: orphanedRecurring }]] = await Promise.all([
    db.select({ transactions: count() }).from(transactions).where(eq(transactions.categoryId, id)),
    db.select({ recurring: count() }).from(recurring).where(eq(recurring.categoryId, id)),
  ]);
  const deleted = await db.delete(categories).where(eq(categories.id, id)).returning({ id: categories.id });
  if (!deleted.length) throw notFound("Categoria");
  return { orphanedTransactions, orphanedRecurring };
}

export async function orphanCounts() {
  const [[{ transactions: orphanTransactions }], [{ recurring: orphanRecurring }]] = await Promise.all([
    db.select({ transactions: count() }).from(transactions).where(isNull(transactions.categoryId)),
    db
      .select({ recurring: count() })
      .from(recurring)
      .where(and(isNull(recurring.categoryId), ne(recurring.kind, "investment"))),
  ]);
  return { transactions: orphanTransactions, recurring: orphanRecurring };
}
