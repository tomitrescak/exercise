import { z } from "zod";
import { db } from "@/prisma/db";
import { handler, HttpError, json, notFound, parseBody } from "@/lib/http";
import { createRoutineFromDraft } from "@/lib/server/routines";
import { markSaved } from "@/lib/server/conversations";

export const POST = handler<{ id: string }>(async (request, { id }) => {
  const { name } = await parseBody(request, z.object({ name: z.string().trim().min(1).max(80) }));
  const conv = await db.orm.public.Conversation.first({ id });
  if (!conv) notFound("Conversation not found");
  if (!conv.draft) throw new HttpError(422, "There is no draft to save yet");
  const routine = await createRoutineFromDraft(conv.draft, { name, parentId: conv.routineId });
  await markSaved(id, routine.id);
  return json({ id: routine.id, name: routine.name }, { status: 201 });
});
