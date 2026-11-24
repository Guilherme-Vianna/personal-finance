import type { NextRequest } from "next/server";
import { ApiError, handle } from "@/lib/api-errors";
import { isMonth } from "@/lib/dates";
import { deletePayment, registerPayment } from "@/lib/services/recurring";

export async function POST(request: Request, ctx: RouteContext<"/api/recurring/[id]/payments">) {
  const { id } = await ctx.params;
  return handle(async () => registerPayment({ ...(await request.json()), recurringId: id }), 201);
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/recurring/[id]/payments">) {
  const { id } = await ctx.params;
  const month = request.nextUrl.searchParams.get("month");
  return handle(async () => {
    if (!isMonth(month)) throw new ApiError(422, "Mês inválido");
    await deletePayment(id, month);
  });
}
