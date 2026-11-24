import type { ExerciseDraft, RoutineDraft } from "@/lib/schemas";

export type FieldChange = { field: string; from: unknown; to: unknown };

export type DraftDiff = {
  routine: FieldChange[];
  added: ExerciseDraft[];
  removed: ExerciseDraft[];
  changed: { name: string; changes: FieldChange[] }[];
  moved: string[];
  unchanged: number;
};

const ROUTINE_FIELDS = ["name", "goal", "format", "rounds", "restBetweenRoundsSec", "estimatedMinutes"] as const;
const EXERCISE_FIELDS = [
  "sets",
  "repsMin",
  "repsMax",
  "durationSec",
  "perSide",
  "loadKg",
  "restSec",
  "targetRir",
  "tempo",
  "equipment",
  "youtubeVideoId",
] as const;

const key = (ex: ExerciseDraft) => ex.name.trim().toLowerCase();

/** Compares two drafts, matching exercises by (case-insensitive) name. */
export function diffDrafts(base: RoutineDraft, next: RoutineDraft): DraftDiff {
  const routine: FieldChange[] = ROUTINE_FIELDS.flatMap((f) =>
    base[f] !== next[f] ? [{ field: f, from: base[f], to: next[f] }] : [],
  );

  const baseByKey = new Map(base.exercises.map((e, i) => [key(e), { e, i }]));
  const nextKeys = new Set(next.exercises.map(key));

  const added: ExerciseDraft[] = [];
  const changed: DraftDiff["changed"] = [];
  const moved: string[] = [];
  let unchanged = 0;

  const baseOrder = base.exercises.map(key).filter((k) => nextKeys.has(k));
  const nextOrder = next.exercises.map(key).filter((k) => baseByKey.has(k));

  next.exercises.forEach((ex) => {
    const match = baseByKey.get(key(ex));
    if (!match) {
      added.push(ex);
      return;
    }
    const changes = EXERCISE_FIELDS.flatMap((f) =>
      match.e[f] !== ex[f] ? [{ field: f, from: match.e[f], to: ex[f] }] : [],
    );
    if (baseOrder.indexOf(key(ex)) !== nextOrder.indexOf(key(ex))) moved.push(ex.name);
    if (changes.length) changed.push({ name: ex.name, changes });
    else unchanged++;
  });

  const removed = base.exercises.filter((e) => !nextKeys.has(key(e)));
  return { routine, added, removed, changed, moved, unchanged };
}

export function isEmptyDiff(d: DraftDiff): boolean {
  return !d.routine.length && !d.added.length && !d.removed.length && !d.changed.length && !d.moved.length;
}
