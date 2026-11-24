import "server-only";
import { and, desc, eq, gte, ilike, lte, max, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { categories, transactions, type CategoryKind, type PaymentMethod } from "@/db/schema";
import { notFound } from "@/lib/api-errors";
import { transactionInput } from "@/lib/validation";

export type TransactionFilters = {
  from?: string | null;
  to?: string | null;
  categoryId?: string | null;
  method?: PaymentMethod | null;
  kind?: CategoryKind | null;
  q?: string | null;
  limit?: number;
};

export async function listTransactions(filters: TransactionFilters = {}) {
  const conditions: SQL[] = [];
  if (filters.from) conditions.push(gte(transactions.date, filters.from));
  if (filters.to) conditions.push(lte(transactions.date, filters.to));
  if (filters.categoryId) conditions.push(eq(transactions.categoryId, filters.categoryId));
  if (filters.method) conditions.push(eq(transactions.method, filters.method));
  if (filters.kind) conditions.push(eq(categories.kind, filters.kind));
  if (filters.q) {
    const term = `%${filters.q}%`;
    conditions.push(or(ilike(transactions.description, term), ilike(transactions.notes, term))!);
  }
  return db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amount: transactions.amount,
      method: transactions.method,
      notes: transactions.notes,
      categoryId: transactions.categoryId,
      createdAt: transactions.createdAt,
      updatedAt: transactions.updatedAt,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryKind: categories.kind,
      outsideBudget: categories.outsideBudget,
    })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(filters.limit ?? 2000);
}

export type TransactionRow = Awaited<ReturnType<typeof listTransactions>>[number];

export async function createTransaction(body: unknown) {
  const data = transactionInput.parse(body);
  const [created] = await db.insert(transactions).values(data).returning();
  return created;
}

export async function updateTransaction(id: string, body: unknown) {
  const data = transactionInput.parse(body);
  const [updated] = await db.update(transactions).set(data).where(eq(transactions.id, id)).returning();
  if (!updated) throw notFound("Lançamento");
  return updated;
}

export async function deleteTransaction(id: string) {
  const deleted = await db.delete(transactions).where(eq(transactions.id, id)).returning({ id: transactions.id });
  if (!deleted.length) throw notFound("Lançamento");
}

export async function descriptionSuggestions() {
  const rows = await db
    .select({
      description: transactions.description,
      categoryId: transactions.categoryId,
      method: transactions.method,
      lastUsed: max(transactions.date),
      lastAmount: sql<number>`(array_agg(${transactions.amount} order by ${transactions.date} desc))[1]`.mapWith(Number),
      uses: sql<number>`count(*)`.mapWith(Number),
    })
    .from(transactions)
    .groupBy(transactions.description, transactions.categoryId, transactions.method)
    .orderBy(desc(max(transactions.date)))
    .limit(300);
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.description.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type DescriptionSuggestion = Awaited<ReturnType<typeof descriptionSuggestions>>[number];
