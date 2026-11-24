import type { NextRequest } from "next/server";
import { ApiError, handle } from "@/lib/api-errors";
import { isMonth } from "@/lib/dates";
import { deleteOverride, setOverride } from "@/lib/services/recurring";

export async function PUT(request: Request, ctx: RouteContext<"/api/recurring/[id]/overrides">) {
  const { id } = await ctx.params;
  return handle(async () => setOverride(id, await request.json()));
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/recurring/[id]/overrides">) {
  const { id } = await ctx.params;
  const month = request.nextUrl.searchParams.get("month");
  return handle(async () => {
    if (!isMonth(month)) throw new ApiError(422, "Mês inválido");
    await deleteOverride(id, month);
  });
}
