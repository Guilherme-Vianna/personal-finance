import { handle } from "@/lib/api-errors";
import { deleteTransaction, updateTransaction } from "@/lib/services/transactions";

export async function PUT(request: Request, ctx: RouteContext<"/api/transactions/[id]">) {
  const { id } = await ctx.params;
  return handle(async () => updateTransaction(id, await request.json()));
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/transactions/[id]">) {
  const { id } = await ctx.params;
  return handle(() => deleteTransaction(id));
}
