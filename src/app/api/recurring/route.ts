import { connection } from "next/server";
import { handle } from "@/lib/api-errors";
import { createRecurring, listRecurring } from "@/lib/services/recurring";

export async function GET() {
  await connection();
  return handle(listRecurring);
}

export async function POST(request: Request) {
  return handle(async () => createRecurring(await request.json()), 201);
}
