import { connection } from "next/server";
import { handle } from "@/lib/api-errors";
import { descriptionSuggestions } from "@/lib/services/transactions";

export async function GET() {
  await connection();
  return handle(descriptionSuggestions);
}
