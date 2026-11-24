import { db } from "@/prisma/db";
import { HttpError } from "@/lib/http";
import { RoutineDraftSchema, type RoutineDraft } from "@/lib/schemas";
import { getRoutine, routineToDraft } from "@/lib/server/routines";

const MAX_HISTORY = 40;

export type DraftSource = "original" | "agent" | "manual" | "revert";
export type DraftHistoryEntry = { version: number; source: DraftSource; at: string; draft: RoutineDraft };

export async function createConversation(routineId: string | null) {
  if (!routineId) {
    return db.orm.public.Conversation.create({
      routineId: null,
      title: null,
      draft: null,
      draftVersion: 0,
      verifiedVideoIds: [],
      savedRoutineIds: [],
    });
  }
  const routine = await getRoutine(routineId);
  if (!routine) throw new HttpError(404, "Routine not found");
  const draft = routineToDraft(routine);
  const history: DraftHistoryEntry[] = [{ version: 1, source: "original", at: new Date().toISOString(), draft }];
  return db.orm.public.Conversation.create({
    routineId,
    title: `Refine: ${routine.name}`.slice(0, 80),
    draft: draft as never,
    draftVersion: 1,
    draftHistory: history as never,
    // Saved routines were verified on save; they stay usable without re-searching.
    verifiedVideoIds: [...new Set(routine.exercises.map((e) => e.youtubeVideoId))],
    savedRoutineIds: [],
  });
}

export async function getConversation(id: string) {
  return db.orm.public.Conversation.where({ id })
    .include("messages", (m) => m.orderBy((x) => x.createdAt.asc()))
    .first();
}

export async function listConversations(limit = 20) {
  return db.orm.public.Conversation.select("id", "title", "routineId", "draftVersion", "updatedAt")
    .orderBy((c) => c.updatedAt.desc())
    .limit(limit)
    .all();
}

export function currentDraft(conv: { draft: unknown }): RoutineDraft | null {
  if (!conv.draft) return null;
  const parsed = RoutineDraftSchema.safeParse(conv.draft);
  return parsed.success ? parsed.data : null;
}

/** Atomically replaces the draft, bumping the version and appending to history. */
export async function setDraft(conversationId: string, draft: RoutineDraft, source: DraftSource) {
  return db.transaction(async (tx) => {
    const conv = await tx.orm.public.Conversation.first({ id: conversationId });
    if (!conv) throw new HttpError(404, "Conversation not found");
    const version = conv.draftVersion + 1;
    const history = ((conv.draftHistory as DraftHistoryEntry[] | null) ?? []).concat({
      version,
      source,
      at: new Date().toISOString(),
      draft,
    });
    // Always keep the original (first) entry so the refine diff has a baseline.
    const trimmed = history.length > MAX_HISTORY ? [history[0], ...history.slice(-(MAX_HISTORY - 1))] : history;
    await tx.orm.public.Conversation.where({ id: conversationId }).update({
      draft: draft as never,
      draftVersion: version,
      draftHistory: trimmed as never,
      title: conv.title ?? draft.name,
    });
    return version;
  });
}

export async function revertDraft(conversationId: string, toVersion: number) {
  const conv = await db.orm.public.Conversation.first({ id: conversationId });
  if (!conv) throw new HttpError(404, "Conversation not found");
  const entry = ((conv.draftHistory as DraftHistoryEntry[] | null) ?? []).find((h) => h.version === toVersion);
  if (!entry) throw new HttpError(404, `Draft version ${toVersion} not found`);
  return setDraft(conversationId, entry.draft, "revert");
}

export async function addVerifiedVideo(conversationId: string, videoId: string) {
  await db.transaction(async (tx) => {
    const conv = await tx.orm.public.Conversation.select("verifiedVideoIds").first({ id: conversationId });
    if (!conv || conv.verifiedVideoIds.includes(videoId)) return;
    await tx.orm.public.Conversation.where({ id: conversationId }).update({
      verifiedVideoIds: [...conv.verifiedVideoIds, videoId],
    });
  });
}

export async function getVerifiedVideoIds(conversationId: string): Promise<Set<string>> {
  const conv = await db.orm.public.Conversation.select("verifiedVideoIds").first({ id: conversationId });
  return new Set(conv?.verifiedVideoIds ?? []);
}

export async function markSaved(conversationId: string, routineId: string) {
  await db.transaction(async (tx) => {
    const conv = await tx.orm.public.Conversation.select("savedRoutineIds").first({ id: conversationId });
    if (!conv) return;
    await tx.orm.public.Conversation.where({ id: conversationId }).update({
      savedRoutineIds: [...conv.savedRoutineIds, routineId],
    });
  });
}
