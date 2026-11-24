import { z } from "zod";
import { handler, json, parseBody } from "@/lib/http";
import { createRoutineFromDraft, listRoutines } from "@/lib/server/routines";

export const GET = handler(async (request) => {
  const includeArchived = request.nextUrl.searchParams.get("archived") === "1";
  return json(await listRoutines({ includeArchived }));
});

export const POST = handler(async (request) => {
  const body = await parseBody(request, z.object({ draft: z.unknown(), parentId: z.string().nullable().optional() }));
  return json(await createRoutineFromDraft(body.draft, { parentId: body.parentId ?? null }), { status: 201 });
});
