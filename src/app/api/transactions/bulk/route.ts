import { handle } from "@/lib/api-errors";
import { createMany } from "@/lib/services/ai-import";

export async function POST(request: Request) {
  return handle(async () => createMany(await request.json()), 201);
}
