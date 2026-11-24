import { connection } from "next/server";
import { handle } from "@/lib/api-errors";
import { todayISO } from "@/lib/dates";
import { listLoans } from "@/lib/services/loans";

export async function GET() {
  await connection();
  return handle(() => listLoans(todayISO()));
}
