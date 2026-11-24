import { ApiError, handle } from "@/lib/api-errors";
import { todayISO } from "@/lib/dates";
import { extractFromFile } from "@/lib/services/ai-import";

export const maxDuration = 300;

export async function POST(request: Request) {
  return handle(async () => {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file") ?? form?.get("image");
    if (!(file instanceof File)) throw new ApiError(422, "Envie um arquivo");
    const hint = form?.get("hint");
    return extractFromFile(file, todayISO(), typeof hint === "string" && hint.trim() ? hint.trim().slice(0, 500) : null);
  });
}
