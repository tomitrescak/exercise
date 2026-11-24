import { db } from "@/prisma/db";
import { HttpError } from "@/lib/http";
import { exercisesMissingVideo, RoutineDraftSchema, type RoutineDraft } from "@/lib/schemas";
import { verifyVideo } from "@/lib/youtube";
import type { RoutineSnapshot } from "@/lib/workout";

export async function getRoutine(id: string) {
  return db.orm.public.Routine.where({ id })
    .include("exercises", (e) => e.orderBy((x) => x.position.asc()))
    .first();
}

export type RoutineWithExercises = NonNullable<Awaited<ReturnType<typeof getRoutine>>>;

export async function listRoutines(opts: { includeArchived?: boolean } = {}) {
  const base = opts.includeArchived ? db.orm.public.Routine : db.orm.public.Routine.where({ archived: false });
  const rows = await base
    .include("exercises", (e) => e.count())
    .include("sessions", (s) => s.max("startedAt"))
    .orderBy((r) => r.createdAt.desc())
    .all();

  const parentIds = [...new Set(rows.map((r) => r.parentId).filter((x): x is string => !!x))];
  const parents = parentIds.length
    ? await db.orm.public.Routine.where((r) => r.id.in(parentIds)).select("id", "name").all()
    : [];
  const parentName = new Map(parents.map((p) => [p.id, p.name]));

  // Starred first (stable sort keeps newest-first within each group); booleans aren't orderable in the query builder.
  rows.sort((a, b) => Number(b.starred) - Number(a.starred));

  return rows.map(({ exercises, sessions, ...r }) => ({
    ...r,
    exerciseCount: exercises,
    lastPerformedAt: sessions,
    parentName: r.parentId ? (parentName.get(r.parentId) ?? null) : null,
  }));
}

export function routineToDraft(r: RoutineWithExercises): RoutineDraft {
  return {
    name: r.name,
    description: r.description,
    goal: r.goal,
    format: r.format,
    rounds: r.rounds,
    restBetweenRoundsSec: r.restBetweenRoundsSec,
    estimatedMinutes: r.estimatedMinutes,
    coachNotes: r.coachNotes,
    rating: (r.rating as RoutineDraft["rating"]) ?? null,
    exercises: r.exercises.map((e) => ({
      name: e.name,
      movementPattern: e.movementPattern as RoutineDraft["exercises"][number]["movementPattern"],
      primaryMuscles: [...e.primaryMuscles],
      equipment: e.equipment,
      loadKg: e.loadKg,
      sets: e.sets,
      repsMin: e.repsMin,
      repsMax: e.repsMax,
      durationSec: e.durationSec,
      perSide: e.perSide,
      tempo: e.tempo,
      restSec: e.restSec,
      targetRir: e.targetRir,
      cues: [...e.cues],
      safetyNotes: e.safetyNotes,
      youtubeVideoId: e.youtubeVideoId,
      youtubeTitle: e.youtubeTitle,
      youtubeChannel: e.youtubeChannel,
      videoDurationSec: e.videoDurationSec,
    })),
  };
}

export function routineToSnapshot(r: RoutineWithExercises): RoutineSnapshot {
  return {
    id: r.id,
    name: r.name,
    format: r.format,
    rounds: r.rounds,
    restBetweenRoundsSec: r.restBetweenRoundsSec,
    estimatedMinutes: r.estimatedMinutes,
    exercises: r.exercises.map((e) => ({
      id: e.id,
      name: e.name,
      movementPattern: e.movementPattern,
      primaryMuscles: [...e.primaryMuscles],
      equipment: e.equipment,
      loadKg: e.loadKg,
      sets: e.sets,
      repsMin: e.repsMin,
      repsMax: e.repsMax,
      durationSec: e.durationSec,
      perSide: e.perSide,
      tempo: e.tempo,
      restSec: e.restSec,
      targetRir: e.targetRir,
      cues: [...e.cues],
      safetyNotes: e.safetyNotes,
      youtubeVideoId: e.youtubeVideoId,
      youtubeTitle: e.youtubeTitle,
      youtubeChannel: e.youtubeChannel,
    })),
  };
}

/**
 * Re-validates a draft and (re)verifies every video (cache fresh < 7 days),
 * then writes Routine + exercises in one transaction.
 */
export async function createRoutineFromDraft(
  input: unknown,
  opts: { name?: string; parentId?: string | null } = {},
): Promise<RoutineWithExercises> {
  const parsed = RoutineDraftSchema.safeParse(input);
  if (!parsed.success) {
    throw new HttpError(422, "Draft is invalid", parsed.error.issues.map((i) => i.message));
  }
  const draft = parsed.data;
  const missing = exercisesMissingVideo(draft);
  if (missing.length) {
    throw new HttpError(
      422,
      "Every exercise needs a verified YouTube video before saving",
      missing.map((i) => draft.exercises[i].name),
    );
  }

  const ids = [...new Set(draft.exercises.map((e) => e.youtubeVideoId!))];
  const results = await Promise.all(ids.map((id) => verifyVideo(id)));
  const failures = results.filter((r) => !r.ok);
  if (failures.length) {
    throw new HttpError(
      422,
      "Some videos failed verification",
      failures.map((f) => `${f.videoId}: ${f.ok ? "" : f.reason}`),
    );
  }
  const verified = new Map(results.flatMap((r) => (r.ok ? [[r.video.videoId, r] as const] : [])));

  const id = await db.transaction(async (tx) => {
    const routine = await tx.orm.public.Routine.create({
      name: opts.name?.trim() || draft.name,
      description: draft.description,
      goal: draft.goal,
      format: draft.format,
      rounds: draft.rounds,
      restBetweenRoundsSec: draft.restBetweenRoundsSec,
      estimatedMinutes: draft.estimatedMinutes,
      coachNotes: draft.coachNotes,
      rating: (draft.rating ?? null) as never,
      parentId: opts.parentId ?? null,
      archived: false,
    });
    await tx.orm.public.RoutineExercise.createAll(
      draft.exercises.map((e, position) => {
        const v = verified.get(e.youtubeVideoId!)!;
        return {
          routineId: routine.id,
          position,
          name: e.name,
          movementPattern: e.movementPattern,
          primaryMuscles: e.primaryMuscles,
          equipment: e.equipment,
          loadKg: e.loadKg,
          sets: e.sets,
          repsMin: e.repsMin,
          repsMax: e.repsMax,
          durationSec: e.durationSec,
          perSide: e.perSide,
          tempo: e.tempo,
          restSec: e.restSec,
          targetRir: e.targetRir,
          cues: e.cues,
          safetyNotes: e.safetyNotes,
          youtubeVideoId: v.video.videoId,
          youtubeTitle: v.video.title,
          youtubeChannel: v.video.channel,
          videoDurationSec: v.video.durationSec,
          videoVerifiedAt: v.verifiedAt,
        };
      }),
    );
    return routine.id;
  });

  return (await getRoutine(id))!;
}

export async function duplicateRoutine(id: string): Promise<RoutineWithExercises> {
  const src = await getRoutine(id);
  if (!src) throw new HttpError(404, "Routine not found");
  const newId = await db.transaction(async (tx) => {
    const { id: _id, exercises, createdAt: _c, updatedAt: _u, ...rest } = src;
    const copy = await tx.orm.public.Routine.create({
      ...rest,
      rating: rest.rating as never,
      name: `${src.name} (copy)`.slice(0, 80),
      parentId: src.id,
      archived: false,
      starred: false,
    });
    if (exercises.length) {
      await tx.orm.public.RoutineExercise.createAll(
        exercises.map(({ id: _eid, routineId: _rid, ...e }) => ({
          ...e,
          primaryMuscles: [...e.primaryMuscles],
          cues: [...e.cues],
          routineId: copy.id,
        })),
      );
    }
    return copy.id;
  });
  return (await getRoutine(newId))!;
}
