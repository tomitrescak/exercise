import { db } from "@/prisma/db";
import { handler, HttpError, json, notFound } from "@/lib/http";
import { suggestRoutineName } from "@/lib/agent/run";
import { currentDraft } from "@/lib/server/conversations";

export const POST = handler<{ id: string }>(async (_req, { id }) => {
  const conv = await db.orm.public.Conversation.first({ id });
  if (!conv) notFound("Conversation not found");
  const draft = currentDraft(conv);
  if (!draft) throw new HttpError(422, "There is no draft yet");
  const name = process.env.OPENAI_API_KEY ? await suggestRoutineName(draft) : draft.name;
  return json({ name });
});
