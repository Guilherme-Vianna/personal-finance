import { ApiError, handle } from "@/lib/api-errors";
import { todayISO } from "@/lib/dates";
import { extractFromImage } from "@/lib/services/ai-import";

export const maxDuration = 120;

export async function POST(request: Request) {
  return handle(async () => {
    const form = await request.formData().catch(() => null);
    const file = form?.get("image");
    if (!(file instanceof File)) throw new ApiError(422, "Envie uma imagem");
    const hint = form?.get("hint");
    return extractFromImage(file, todayISO(), typeof hint === "string" && hint.trim() ? hint.trim().slice(0, 500) : null);
  });
}
