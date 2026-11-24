import { z } from "zod";
import { handler, HttpError, json, parseBody } from "@/lib/http";
import { RoutineDraftSchema } from "@/lib/schemas";
import { getVerifiedVideoIds, setDraft } from "@/lib/server/conversations";

// Manual edit of the working draft (reorder, change prescription, delete).
export const PATCH = handler<{ id: string }>(async (request, { id }) => {
  const { draft } = await parseBody(request, z.object({ draft: RoutineDraftSchema }));
  const verified = await getVerifiedVideoIds(id);
  const bad = draft.exercises.filter((e) => e.youtubeVideoId && !verified.has(e.youtubeVideoId));
  if (bad.length) throw new HttpError(422, "Videos can only come from the coach's verified results", bad.map((e) => e.name));
  return json({ version: await setDraft(id, draft, "manual") });
});
