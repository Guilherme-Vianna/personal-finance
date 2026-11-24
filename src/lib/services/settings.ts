import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { settingsInput } from "@/lib/validation";

export async function getSettings() {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  if (row) return row;
  const [created] = await db.insert(settings).values({ id: 1 }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(settings).where(eq(settings.id, 1)))[0];
}

export async function updateSettings(body: unknown) {
  const data = settingsInput.parse(body);
  const [row] = await db
    .insert(settings)
    .values({ id: 1, ...data })
    .onConflictDoUpdate({ target: settings.id, set: data })
    .returning();
  return row;
}
