import { handle } from "@/lib/api-errors";
import { deleteRepayment } from "@/lib/services/loans";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/loans/repayments/[id]">) {
  const { id } = await ctx.params;
  return handle(() => deleteRepayment(id));
}
