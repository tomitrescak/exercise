import { db } from "@/prisma/db";
import { handler, json, notFound } from "@/lib/http";
import { exercisesMissingVideo } from "@/lib/schemas";
import { currentDraft, getConversation, type DraftHistoryEntry } from "@/lib/server/conversations";

export const GET = handler<{ id: string }>(async (_req, { id }) => {
  const conv = await getConversation(id);
  if (!conv) notFound("Conversation not found");
  const draft = currentDraft(conv);
  const history = (conv.draftHistory as DraftHistoryEntry[] | null) ?? [];
  const original = history.find((h) => h.source === "original")?.draft ?? null;
  const [routine, saved] = await Promise.all([
    conv.routineId ? db.orm.public.Routine.select("id", "name").first({ id: conv.routineId }) : null,
    conv.savedRoutineIds.length
      ? db.orm.public.Routine.where((r) => r.id.in([...conv.savedRoutineIds])).select("id", "name").all()
      : [],
  ]);
  return json({
    id: conv.id,
    title: conv.title,
    routine,
    draft,
    draftVersion: conv.draftVersion,
    original,
    versions: history.map(({ version, source, at, draft: d }) => ({ version, source, at, name: d.name })),
    missingVideo: draft ? exercisesMissingVideo(draft) : [],
    savedRoutines: saved,
    messages: conv.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      toolCalls: m.toolCalls,
      sources: m.sources,
      draftVersion: m.draftVersion,
      createdAt: m.createdAt,
    })),
  });
});
