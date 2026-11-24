import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { goalDeposits, goals } from "@/db/schema";
import { notFound } from "@/lib/api-errors";
import { goalProgress } from "@/lib/goals";
import { recurringDates } from "@/lib/recurring";
import { depositInput, goalInput } from "@/lib/validation";
import { listRecurring } from "./recurring";

export type DepositRow = { id: string; date: string; amount: number; notes: string | null; recurringId: string | null; recurringName: string | null };

// Investments linked to a goal are never stored as deposits: each month that already happened counts as one.
export async function listGoals(today: string) {
  const [rows, manual, recurringItems] = await Promise.all([
    db.select().from(goals).orderBy(asc(goals.status), asc(goals.createdAt)),
    db.select().from(goalDeposits).orderBy(desc(goalDeposits.date), desc(goalDeposits.createdAt)),
    listRecurring(),
  ]);
  return rows.map((goal) => {
    const fromRecurring: DepositRow[] = recurringItems
      .filter((item) => item.goalId === goal.id)
      .flatMap((item) =>
        recurringDates(item, `${item.startMonth}-01`, today).map(({ date, amount }) => ({
          id: `recorrente:${item.id}:${date}`,
          date,
          amount,
          notes: null,
          recurringId: item.id,
          recurringName: item.name,
        })),
      );
    const deposits: DepositRow[] = [
      ...manual.filter((d) => d.goalId === goal.id).map((d) => ({ id: d.id, date: d.date, amount: d.amount, notes: d.notes, recurringId: null, recurringName: null })),
      ...fromRecurring,
    ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return {
      ...goal,
      createdAt: goal.createdAt.toISOString(),
      updatedAt: goal.updatedAt.toISOString(),
      deposits,
      linkedRecurring: recurringItems.filter((item) => item.goalId === goal.id && item.active).map((item) => ({ id: item.id, name: item.name, amount: item.amount })),
      progress: goalProgress({ targetAmount: goal.targetAmount, deadline: goal.deadline, status: goal.status, deposits }, today),
    };
  });
}

export type GoalWithProgress = Awaited<ReturnType<typeof listGoals>>[number];

export async function createGoal(body: unknown) {
  const data = goalInput.parse(body);
  const [created] = await db.insert(goals).values(data).returning();
  return created;
}

export async function updateGoal(id: string, body: unknown) {
  const data = goalInput.parse(body);
  const [updated] = await db.update(goals).set(data).where(eq(goals.id, id)).returning();
  if (!updated) throw notFound("Meta");
  return updated;
}

export async function deleteGoal(id: string) {
  const deleted = await db.delete(goals).where(eq(goals.id, id)).returning({ id: goals.id });
  if (!deleted.length) throw notFound("Meta");
}

export async function createDeposit(goalId: string, body: unknown) {
  const data = depositInput.parse(body);
  const [goal] = await db.select({ id: goals.id }).from(goals).where(eq(goals.id, goalId));
  if (!goal) throw notFound("Meta");
  const [created] = await db.insert(goalDeposits).values({ ...data, goalId }).returning();
  return created;
}

export async function deleteDeposit(id: string) {
  const deleted = await db.delete(goalDeposits).where(eq(goalDeposits.id, id)).returning({ id: goalDeposits.id });
  if (!deleted.length) throw notFound("Depósito");
}
