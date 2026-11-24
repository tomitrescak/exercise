import { z } from "zod";
import { handler, json, parseBody } from "@/lib/http";
import { revertDraft } from "@/lib/server/conversations";

export const POST = handler<{ id: string }>(async (request, { id }) => {
  const { version } = await parseBody(request, z.object({ version: z.number().int().min(1) }));
  return json({ version: await revertDraft(id, version) });
});
