import { connection } from "next/server";
import { handle } from "@/lib/api-errors";
import { getSettings, updateSettings } from "@/lib/services/settings";

export async function GET() {
  await connection();
  return handle(getSettings);
}

export async function PUT(request: Request) {
  return handle(async () => updateSettings(await request.json()));
}
