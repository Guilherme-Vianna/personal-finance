import { handle } from "@/lib/api-errors";
import { createRepayment } from "@/lib/services/loans";

export async function POST(request: Request) {
  return handle(async () => createRepayment(await request.json()), 201);
}
