import { z } from "zod";
import { handle } from "@/lib/api-errors";
import { askAssistant } from "@/lib/agent/agent";

export const maxDuration = 120;

const body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(8000) }))
    .min(1)
    .max(40)
    .refine((messages) => messages.at(-1)?.role === "user", "A última mensagem precisa ser sua"),
});

export async function POST(request: Request) {
  return handle(async () => askAssistant(body.parse(await request.json()).messages));
}
