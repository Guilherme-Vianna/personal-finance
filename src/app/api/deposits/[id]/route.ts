import { handle } from "@/lib/api-errors";
import { deleteDeposit } from "@/lib/services/goals";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/deposits/[id]">) {
  const { id } = await ctx.params;
  return handle(() => deleteDeposit(id));
}
