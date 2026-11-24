import "server-only";
import { and, desc, eq, gte, isNotNull, lte, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { categories, loanRepayments, transactions } from "@/db/schema";
import { notFound } from "@/lib/api-errors";
import { addMonths, monthOf } from "@/lib/dates";
import { amountFor, installmentOf, recurringDates } from "@/lib/recurring";
import { repaymentInput } from "@/lib/validation";
import { listRecurring } from "./recurring";

export async function listRepayments({ from, to }: { from?: string | null; to?: string | null } = {}) {
  const conditions: SQL[] = [];
  if (from) conditions.push(gte(loanRepayments.date, from));
  if (to) conditions.push(lte(loanRepayments.date, to));
  return db
    .select()
    .from(loanRepayments)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(loanRepayments.date), desc(loanRepayments.createdAt));
}

function personKey(name: string) {
  return name.trim().toLowerCase();
}

export type LoanMovement = { id: string; date: string; label: string; amount: number; kind: "lent" | "repaid"; detail: string | null; future: boolean };

// Lent installments are expanded like any recurring item: past ones are owed now, future ones are listed as still to come.
export async function listLoans(today: string) {
  const [lentRows, items, repayments] = await Promise.all([
    db
      .select({ id: transactions.id, date: transactions.date, description: transactions.description, amount: transactions.amount, lentTo: transactions.lentTo, categoryName: categories.name })
      .from(transactions)
      .innerJoin(categories, eq(categories.id, transactions.categoryId))
      .where(isNotNull(transactions.lentTo)),
    listRecurring(),
    listRepayments(),
  ]);
  const lentItems = items.filter((item) => item.kind === "expense" && item.lentTo);

  const people = new Map<string, { name: string; movements: LoanMovement[]; plans: { id: string; name: string; amount: number; installment: number | null; installments: number | null; endMonth: string | null; futureAmount: number }[] }>();
  const person = (name: string) => {
    const key = personKey(name);
    if (!people.has(key)) people.set(key, { name: name.trim(), movements: [], plans: [] });
    return people.get(key)!;
  };

  for (const row of lentRows) {
    person(row.lentTo!).movements.push({ id: row.id, date: row.date, label: row.description, amount: row.amount, kind: "lent", detail: row.categoryName, future: row.date > today });
  }
  const currentMonth = monthOf(today);
  for (const item of lentItems) {
    const entry = person(item.lentTo!);
    const horizon = item.endMonth ?? addMonths(currentMonth, 12);
    for (const { date, month, amount } of recurringDates(item, `${item.startMonth}-01`, `${horizon}-31`)) {
      const number = installmentOf(item, month);
      entry.movements.push({
        id: `parcela:${item.id}:${month}`,
        date,
        label: item.name,
        amount,
        kind: "lent",
        detail: number ? `parcela ${number}/${item.installments}` : "mensal",
        future: date > today,
      });
    }
    const futureAmount = item.endMonth
      ? recurringDates(item, `${currentMonth}-01`, `${item.endMonth}-31`)
          .filter(({ date }) => date > today)
          .reduce((t, { month }) => t + amountFor(item, month), 0)
      : 0;
    entry.plans.push({ id: item.id, name: item.name, amount: item.amount, installment: installmentOf(item, currentMonth), installments: item.installments, endMonth: item.endMonth, futureAmount });
  }
  for (const repayment of repayments) {
    person(repayment.person).movements.push({ id: repayment.id, date: repayment.date, label: "Pagamento recebido", amount: repayment.amount, kind: "repaid", detail: repayment.notes, future: false });
  }

  return [...people.values()]
    .map((entry) => {
      const movements = entry.movements.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      const lent = movements.filter((m) => m.kind === "lent" && !m.future).reduce((t, m) => t + m.amount, 0);
      const upcoming = movements.filter((m) => m.kind === "lent" && m.future).reduce((t, m) => t + m.amount, 0);
      const repaid = movements.filter((m) => m.kind === "repaid").reduce((t, m) => t + m.amount, 0);
      return { ...entry, movements, lent, upcoming, repaid, balance: lent - repaid, percent: lent > 0 ? Math.min(100, (repaid / lent) * 100) : 0 };
    })
    .sort((a, b) => b.balance - a.balance);
}

export type PersonLoans = Awaited<ReturnType<typeof listLoans>>[number];

export async function loanPeople() {
  const [rows, items, repayments] = await Promise.all([
    db.selectDistinct({ name: transactions.lentTo }).from(transactions).where(isNotNull(transactions.lentTo)),
    listRecurring(),
    db.selectDistinct({ name: loanRepayments.person }).from(loanRepayments),
  ]);
  const names = [...rows.map((r) => r.name!), ...items.filter((i) => i.lentTo).map((i) => i.lentTo!), ...repayments.map((r) => r.name)];
  const seen = new Map<string, string>();
  for (const name of names) if (!seen.has(personKey(name))) seen.set(personKey(name), name.trim());
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export async function createRepayment(body: unknown) {
  const data = repaymentInput.parse(body);
  const [created] = await db.insert(loanRepayments).values(data).returning();
  return created;
}

export async function deleteRepayment(id: string) {
  const deleted = await db.delete(loanRepayments).where(eq(loanRepayments.id, id)).returning({ id: loanRepayments.id });
  if (!deleted.length) throw notFound("Pagamento");
}
