import { db } from "@/prisma/db";
import { HttpError } from "@/lib/http";
import type { Cursor, SetLogInput } from "@/lib/schemas";
import { getRoutine, routineToSnapshot } from "@/lib/server/routines";
import { activeSeconds, initialCursor, pendingPauseSec } from "@/lib/workout";

export async function getSession(id: string) {
  return db.orm.public.WorkoutSession.where({ id })
    .include("sets", (s) => s.orderBy((x) => x.completedAt.asc()))
    .first();
}

async function requireInProgress(id: string) {
  const s = await db.orm.public.WorkoutSession.first({ id });
  if (!s) throw new HttpError(404, "Session not found");
  if (s.status !== "IN_PROGRESS") throw new HttpError(409, "Session is already finished");
  return s;
}

export async function findInProgress() {
  return db.orm.public.WorkoutSession.where({ status: "IN_PROGRESS" })
    .select("id", "routineId", "routineSnapshot", "startedAt", "pausedAt", "pausedTotalSec")
    .orderBy((s) => s.startedAt.desc())
    .first();
}

/** Starts a session, or returns the existing in-progress one for the same routine. */
export async function startSession(routineId: string) {
  const existing = await db.orm.public.WorkoutSession.where({ routineId, status: "IN_PROGRESS" })
    .select("id")
    .first();
  if (existing) return { id: existing.id, resumed: true };

  const routine = await getRoutine(routineId);
  if (!routine) throw new HttpError(404, "Routine not found");
  if (routine.exercises.length === 0) throw new HttpError(422, "Routine has no exercises");
  const created = await db.orm.public.WorkoutSession.create({
    routineId,
    routineSnapshot: routineToSnapshot(routine) as never,
    status: "IN_PROGRESS",
    startedAt: new Date(),
    pausedTotalSec: 0,
    cursor: initialCursor() as never,
  });
  return { id: created.id, resumed: false };
}

export async function logSet(sessionId: string, input: SetLogInput) {
  await requireInProgress(sessionId);
  const { cursor, ...set } = input;
  await db.transaction(async (tx) => {
    // Idempotent per (exercise, round, set, side): a re-submit replaces the previous log.
    await tx.orm.public.SetLog.where({
      sessionId,
      exerciseId: set.exerciseId,
      round: set.round,
      setIndex: set.setIndex,
      side: set.side,
    }).deleteAll();
    await tx.orm.public.SetLog.create({ ...set, sessionId, completedAt: new Date() });
    await tx.orm.public.WorkoutSession.where({ id: sessionId }).update({ cursor: cursor as never });
  });
  return getSession(sessionId);
}

export async function updateCursor(sessionId: string, cursor: Cursor) {
  await requireInProgress(sessionId);
  await db.orm.public.WorkoutSession.where({ id: sessionId }).update({ cursor: cursor as never });
  return getSession(sessionId);
}

export async function pauseSession(sessionId: string, cursor?: Cursor) {
  const s = await requireInProgress(sessionId);
  if (!s.pausedAt) {
    await db.orm.public.WorkoutSession.where({ id: sessionId }).update({
      pausedAt: new Date(),
      ...(cursor ? { cursor: cursor as never } : {}),
    });
  }
  return getSession(sessionId);
}

export async function resumeSession(sessionId: string) {
  const s = await requireInProgress(sessionId);
  if (s.pausedAt) {
    await db.orm.public.WorkoutSession.where({ id: sessionId }).update({
      pausedAt: null,
      pausedTotalSec: s.pausedTotalSec + pendingPauseSec(s),
    });
  }
  return getSession(sessionId);
}

export async function endSession(
  sessionId: string,
  status: "COMPLETED" | "ABANDONED",
  extra: { perceivedExertion?: number | null; notes?: string | null } = {},
) {
  const s = await requireInProgress(sessionId);
  const now = new Date();
  const pausedTotalSec = s.pausedTotalSec + pendingPauseSec(s, now);
  const activeDurationSec = Math.round(activeSeconds({ startedAt: s.startedAt, endedAt: now, pausedTotalSec }));
  await db.orm.public.WorkoutSession.where({ id: sessionId }).update({
    status,
    endedAt: now,
    pausedAt: null,
    pausedTotalSec,
    activeDurationSec,
    perceivedExertion: extra.perceivedExertion ?? null,
    notes: extra.notes ?? null,
    cursor: { ...(s.cursor as Cursor), phase: "done" } as never,
  });
  return getSession(sessionId);
}

/** Monday 00:00 (local server time) of the week containing d. */
export function weekStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/** Permanently deletes a workout; its set logs go with it (FK cascade). */
export async function deleteSession(id: string): Promise<boolean> {
  return (await db.orm.public.WorkoutSession.where({ id }).delete()) != null;
}

export async function getHistory(opts: {
  weeks: number;
  routineId?: string;
  page: number;
  pageSize: number;
  sort: "date_desc" | "date_asc" | "duration_desc" | "duration_asc";
}) {
  const finished = db.orm.public.WorkoutSession.where((s) => s.status.neq("IN_PROGRESS"));
  const filtered = opts.routineId ? finished.where({ routineId: opts.routineId }) : finished;

  const [rows, totals] = await Promise.all([
    filtered
      .select("id", "routineId", "routineSnapshot", "status", "startedAt", "activeDurationSec", "perceivedExertion")
      .include("sets", (s) => s.where({ skipped: false }).count())
      .orderBy((s) => {
        switch (opts.sort) {
          case "date_asc":
            return s.startedAt.asc();
          case "duration_desc":
            return s.activeDurationSec.desc({ nulls: "last" });
          case "duration_asc":
            return s.activeDurationSec.asc({ nulls: "last" });
          default:
            return s.startedAt.desc();
        }
      })
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize)
      .all(),
    filtered.aggregate((a) => ({ n: a.count() })),
  ]);

  const sessions = rows.map(({ routineSnapshot, sets, ...r }) => {
    const snap = routineSnapshot as { name?: string; exercises?: { sets: number; perSide: boolean }[]; rounds?: number; format?: string };
    const rounds = snap.format === "CIRCUIT" ? (snap.rounds ?? 1) : 1;
    const plannedSets = (snap.exercises ?? []).reduce((n, e) => n + e.sets * (e.perSide ? 2 : 1), 0) * rounds;
    return { ...r, routineName: snap.name ?? "Routine", setsCompleted: sets, plannedSets };
  });

  // Weekly totals for the last N weeks (completed sessions only).
  const since = weekStart(new Date());
  since.setDate(since.getDate() - 7 * (opts.weeks - 1));
  const recent = await db.orm.public.WorkoutSession.where((s) => s.status.eq("COMPLETED"))
    .where((s) => s.startedAt.gte(since))
    .select("id", "startedAt", "activeDurationSec")
    .all();

  const weekly = Array.from({ length: opts.weeks }, (_, i) => {
    const start = new Date(since);
    start.setDate(start.getDate() + 7 * i);
    return { weekStart: start.toISOString(), sessions: 0, minutes: 0 };
  });
  for (const s of recent) {
    const idx = Math.floor((weekStart(new Date(s.startedAt)).getTime() - since.getTime()) / (7 * 86400_000));
    const bucket = weekly[Math.round(idx)];
    if (!bucket) continue;
    bucket.sessions++;
    bucket.minutes += Math.round((s.activeDurationSec ?? 0) / 60);
  }

  // Per-exercise trend: best reps / load per session.
  const recentIds = recent.map((s) => s.id);
  const dateById = new Map(recent.map((s) => [s.id, new Date(s.startedAt).toISOString()]));
  const logs = recentIds.length
    ? await db.orm.public.SetLog.where((l) => l.sessionId.in(recentIds))
        .where({ skipped: false })
        .select("sessionId", "exerciseName", "actualReps", "loadKg", "durationSec")
        .all()
    : [];
  const trendMap = new Map<string, Map<string, { date: string; maxReps: number | null; maxLoadKg: number | null; totalReps: number }>>();
  for (const l of logs) {
    const perEx = trendMap.get(l.exerciseName) ?? new Map();
    trendMap.set(l.exerciseName, perEx);
    const point = perEx.get(l.sessionId) ?? { date: dateById.get(l.sessionId)!, maxReps: null, maxLoadKg: null, totalReps: 0 };
    if (l.actualReps != null) {
      point.maxReps = Math.max(point.maxReps ?? 0, l.actualReps);
      point.totalReps += l.actualReps;
    }
    if (l.loadKg != null) point.maxLoadKg = Math.max(point.maxLoadKg ?? 0, l.loadKg);
    perEx.set(l.sessionId, point);
  }
  const exerciseTrends = [...trendMap.entries()]
    .map(([exerciseName, points]) => ({
      exerciseName,
      points: [...points.values()].sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .sort((a, b) => b.points.length - a.points.length || a.exerciseName.localeCompare(b.exerciseName));

  return { sessions, total: totals.n, page: opts.page, pageSize: opts.pageSize, weekly, exerciseTrends };
}

/** Compact summary of recent sessions for the agent context. */
export async function recentWorkoutSummary(opts: { routineId?: string | null; limit: number }) {
  const base = db.orm.public.WorkoutSession.where({ status: "COMPLETED" });
  const sessions = await (opts.routineId ? base.where({ routineId: opts.routineId }) : base)
    .include("sets", (s) => s.orderBy((x) => x.completedAt.asc()))
    .orderBy((s) => s.startedAt.desc())
    .limit(opts.limit)
    .all();
  return sessions.map((s) => {
    const byExercise = new Map<string, { reps: number[]; loadKg: number | null; skipped: number }>();
    for (const set of s.sets) {
      const e = byExercise.get(set.exerciseName) ?? { reps: [], loadKg: null, skipped: 0 };
      if (set.skipped) e.skipped++;
      else if (set.actualReps != null) e.reps.push(set.actualReps);
      if (set.loadKg != null) e.loadKg = set.loadKg;
      byExercise.set(set.exerciseName, e);
    }
    return {
      date: new Date(s.startedAt).toISOString().slice(0, 10),
      routine: (s.routineSnapshot as { name?: string }).name ?? "Routine",
      routineId: s.routineId,
      activeMinutes: Math.round((s.activeDurationSec ?? 0) / 60),
      rpe: s.perceivedExertion,
      notes: s.notes,
      exercises: [...byExercise.entries()].map(([name, v]) => ({ name, reps: v.reps, loadKg: v.loadKg, skippedSets: v.skipped })),
    };
  });
}
