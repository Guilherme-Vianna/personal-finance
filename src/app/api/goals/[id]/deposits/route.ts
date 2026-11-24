import { handle } from "@/lib/api-errors";
import { createDeposit } from "@/lib/services/goals";

export async function POST(request: Request, ctx: RouteContext<"/api/goals/[id]/deposits">) {
  const { id } = await ctx.params;
  return handle(async () => createDeposit(id, await request.json()), 201);
}
