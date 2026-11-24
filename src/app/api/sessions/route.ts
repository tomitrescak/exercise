import { z } from "zod";
import { handler, json, parseBody } from "@/lib/http";
import { findInProgress, startSession } from "@/lib/server/sessions";

export const GET = handler(async () => json({ inProgress: await findInProgress() }));

export const POST = handler(async (request) => {
  const { routineId } = await parseBody(request, z.object({ routineId: z.string().min(1) }));
  return json(await startSession(routineId), { status: 201 });
});
