import type { NextRequest } from "next/server";
import { PAYMENT_METHODS, type PaymentMethod } from "@/db/schema";
import { handle } from "@/lib/api-errors";
import { createTransaction, listTransactions } from "@/lib/services/transactions";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const method = params.get("method");
  return handle(() =>
    listTransactions({
      from: params.get("from"),
      to: params.get("to"),
      categoryId: params.get("categoryId"),
      method: PAYMENT_METHODS.includes(method as PaymentMethod) ? (method as PaymentMethod) : null,
      q: params.get("q"),
      limit: Math.min(5000, Number(params.get("limit")) || 500),
    }),
  );
}

export async function POST(request: Request) {
  return handle(async () => createTransaction(await request.json()), 201);
}
