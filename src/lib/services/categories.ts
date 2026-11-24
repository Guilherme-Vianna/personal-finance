import "server-only";
import { asc, count, eq, sql } from "drizzle-orm";
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
    })
    .from(categories)
    .leftJoin(transactions, eq(transactions.categoryId, categories.id))
    .groupBy(categories.id)
    .orderBy(asc(categories.name));
  return rows.map((row) => ({ ...row.category, transactionsCount: row.transactionsCount, totalAmount: row.totalAmount }));
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

export async function deleteCategory(id: string) {
  const [{ used }] = await db.select({ used: count() }).from(transactions).where(eq(transactions.categoryId, id));
  if (used > 0) throw new ApiError(409, `Essa categoria tem ${used} lançamento(s). Mova ou apague os lançamentos antes.`);
  const [{ fixed }] = await db.select({ fixed: count() }).from(recurring).where(eq(recurring.categoryId, id));
  if (fixed > 0) throw new ApiError(409, `Essa categoria é usada por ${fixed} item(ns) do orçamento. Troque a categoria deles antes.`);
  const deleted = await db.delete(categories).where(eq(categories.id, id)).returning({ id: categories.id });
  if (!deleted.length) throw notFound("Categoria");
}
