import { z } from "zod";
import { handler, json, parseBody } from "@/lib/http";
import { createConversation, listConversations } from "@/lib/server/conversations";

export const GET = handler(async () => json(await listConversations()));

export const POST = handler(async (request) => {
  const { routineId } = await parseBody(request, z.object({ routineId: z.string().nullable().optional() }));
  const conv = await createConversation(routineId ?? null);
  return json({ id: conv.id }, { status: 201 });
});
