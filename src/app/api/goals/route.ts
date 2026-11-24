import { connection } from "next/server";
import { handle } from "@/lib/api-errors";
import { todayISO } from "@/lib/dates";
import { createGoal, listGoals } from "@/lib/services/goals";

export async function GET() {
  await connection();
  return handle(() => listGoals(todayISO()));
}

export async function POST(request: Request) {
  return handle(async () => createGoal(await request.json()), 201);
}
