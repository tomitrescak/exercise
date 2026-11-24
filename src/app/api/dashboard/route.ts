import { db } from "@/prisma/db";
import { handler, json } from "@/lib/http";
import { listConversations } from "@/lib/server/conversations";
import { findInProgress, weekStart } from "@/lib/server/sessions";

export const GET = handler(async () => {
  const since = weekStart(new Date());
  const [inProgress, week, recent, routines, conversations] = await Promise.all([
    findInProgress(),
    db.orm.public.WorkoutSession.where({ status: "COMPLETED" })
      .where((s) => s.startedAt.gte(since))
      .aggregate((a) => ({ sessions: a.count(), seconds: a.sum("activeDurationSec") })),
    db.orm.public.WorkoutSession.where((s) => s.status.neq("IN_PROGRESS"))
      .select("routineId", "startedAt")
      .orderBy((s) => s.startedAt.desc())
      .limit(30)
      .all(),
    db.orm.public.Routine.where({ archived: false })
      .select("id", "name", "estimatedMinutes", "starred", "createdAt")
      .orderBy((r) => r.createdAt.desc())
      .all(),
    listConversations(5),
  ]);

  // Quick start: starred first, then most recently performed, then newest routines.
  const lastDone = new Map<string, Date>();
  for (const s of recent) if (!lastDone.has(s.routineId)) lastDone.set(s.routineId, s.startedAt);
  const quickStart = [...routines]
    .sort(
      (a, b) =>
        Number(b.starred) - Number(a.starred) ||
        (lastDone.get(b.id)?.getTime() ?? 0) - (lastDone.get(a.id)?.getTime() ?? 0),
    )
    .slice(0, 4)
    .map((r) => ({ ...r, lastPerformedAt: lastDone.get(r.id) ?? null }));

  return json({
    inProgress: inProgress
      ? { id: inProgress.id, routineName: (inProgress.routineSnapshot as { name?: string }).name, startedAt: inProgress.startedAt }
      : null,
    thisWeek: { sessions: week.sessions, minutes: Math.round(Number(week.seconds ?? 0) / 60) },
    quickStart,
    conversations,
  });
});
