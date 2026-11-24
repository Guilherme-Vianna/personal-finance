import { handle } from "@/lib/api-errors";
import { deleteRecurring, updateRecurring } from "@/lib/services/recurring";

export async function PUT(request: Request, ctx: RouteContext<"/api/recurring/[id]">) {
  const { id } = await ctx.params;
  return handle(async () => updateRecurring(id, await request.json()));
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/recurring/[id]">) {
  const { id } = await ctx.params;
  return handle(() => deleteRecurring(id));
}
