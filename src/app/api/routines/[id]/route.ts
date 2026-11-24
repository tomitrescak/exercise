import { z } from "zod";
import { db } from "@/prisma/db";
import { handler, json, notFound, parseBody } from "@/lib/http";
import { getRoutine } from "@/lib/server/routines";

type P = { id: string };

export const GET = handler<P>(async (_req, { id }) => {
  const routine = await getRoutine(id);
  if (!routine) notFound("Routine not found");
  const [parent, sessions] = await Promise.all([
    routine.parentId ? db.orm.public.Routine.select("id", "name").first({ id: routine.parentId }) : null,
    db.orm.public.WorkoutSession.where({ routineId: id })
      .select("id", "status", "startedAt", "activeDurationSec", "perceivedExertion")
      .orderBy((s) => s.startedAt.desc())
      .limit(10)
      .all(),
  ]);
  return json({ ...routine, parent, sessions });
});

const Patch = z
  .object({ name: z.string().min(1).max(80), description: z.string().max(1000).nullable(), archived: z.boolean(), starred: z.boolean() })
  .partial();

export const PATCH = handler<P>(async (request, { id }) => {
  const data = await parseBody(request, Patch);
  const updated = await db.orm.public.Routine.where({ id }).update(data);
  if (!updated) notFound("Routine not found");
  return json(updated);
});

// "Delete" archives: history keeps referencing the routine.
export const DELETE = handler<P>(async (_req, { id }) => {
  const updated = await db.orm.public.Routine.where({ id }).update({ archived: true });
  if (!updated) notFound("Routine not found");
  return json(updated);
});
