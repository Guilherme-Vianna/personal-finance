import type { NextRequest } from "next/server";
import { handle } from "@/lib/api-errors";
import { isMonth, monthOf, todayISO } from "@/lib/dates";
import { dashboardStats } from "@/lib/services/stats";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const month = params.get("month");
  const today = todayISO();
  return handle(() => dashboardStats({ month: isMonth(month) ? month : monthOf(today), includeOutside: params.get("includeOutside") === "true", today }));
}
