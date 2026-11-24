import { handle } from "@/lib/api-errors";
import { deleteGoal, updateGoal } from "@/lib/services/goals";

export async function PUT(request: Request, ctx: RouteContext<"/api/goals/[id]">) {
  const { id } = await ctx.params;
  return handle(async () => updateGoal(id, await request.json()));
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/goals/[id]">) {
  const { id } = await ctx.params;
  return handle(() => deleteGoal(id));
}
