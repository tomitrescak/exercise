import { z } from "zod";
import { handler, json, notFound, parseBody } from "@/lib/http";
import { CursorSchema } from "@/lib/schemas";
import { endSession, pauseSession, resumeSession } from "@/lib/server/sessions";

const Finish = z.object({
  perceivedExertion: z.number().int().min(1).max(10).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const POST = handler<{ id: string; action: string }>(async (request, { id, action }) => {
  switch (action) {
    case "pause": {
      const { cursor } = await parseBody(request, z.object({ cursor: CursorSchema.optional() }));
      return json(await pauseSession(id, cursor));
    }
    case "resume":
      return json(await resumeSession(id));
    case "finish":
      return json(await endSession(id, "COMPLETED", await parseBody(request, Finish)));
    case "abandon":
      return json(await endSession(id, "ABANDONED"));
    default:
      notFound(`Unknown action ${action}`);
  }
});
