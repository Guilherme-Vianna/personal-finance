import { connection } from "next/server";
import { handle } from "@/lib/api-errors";
import { loanPeople } from "@/lib/services/loans";

export async function GET() {
  await connection();
  return handle(loanPeople);
}
