import type { Cursor } from "@/lib/schemas";

export type SnapshotExercise = {
  id: string;
  name: string;
  movementPattern: string;
  primaryMuscles: string[];
  equipment: string | null;
  loadKg: number | null;
  sets: number;
  repsMin: number | null;
  repsMax: number | null;
  durationSec: number | null;
  perSide: boolean;
  tempo: string | null;
  restSec: number;
  targetRir: number | null;
  cues: string[];
  safetyNotes: string | null;
  youtubeVideoId: string;
  youtubeTitle: string;
  youtubeChannel: string;
};

export type RoutineSnapshot = {
  id: string;
  name: string;
  format: "CIRCUIT" | "STRAIGHT_SETS";
  rounds: number;
  restBetweenRoundsSec: number;
  estimatedMinutes: number;
  exercises: SnapshotExercise[];
};

export type Step = {
  exerciseIndex: number;
  round: number;
  setIndex: number;
  side: "" | "left" | "right";
  /** Rest after this step; 0 between sides and after the final step. */
  restAfterSec: number;
  endsRound: boolean;
};

/** Expands a routine into the ordered list of sets the player walks through. */
export function buildSteps(r: Pick<RoutineSnapshot, "format" | "rounds" | "restBetweenRoundsSec" | "exercises">): Step[] {
  const steps: Step[] = [];
  const sidesOf = (ex: SnapshotExercise): Step["side"][] => (ex.perSide ? ["left", "right"] : [""]);
  const rounds = r.format === "CIRCUIT" ? Math.max(1, r.rounds) : 1;

  for (let round = 1; round <= rounds; round++) {
    r.exercises.forEach((ex, exerciseIndex) => {
      for (let setIndex = 1; setIndex <= ex.sets; setIndex++) {
        for (const side of sidesOf(ex)) {
          steps.push({ exerciseIndex, round, setIndex, side, restAfterSec: side === "left" ? 0 : ex.restSec, endsRound: false });
        }
      }
    });
    if (steps.length > 0) {
      const last = steps[steps.length - 1];
      last.endsRound = true;
      if (r.format === "CIRCUIT") last.restAfterSec = r.restBetweenRoundsSec;
    }
  }
  if (steps.length > 0) steps[steps.length - 1].restAfterSec = 0;
  return steps;
}

export type TimingFields = {
  startedAt: Date | string;
  endedAt?: Date | string | null;
  pausedAt?: Date | string | null;
  pausedTotalSec: number;
};

const ms = (d: Date | string) => new Date(d).getTime();

/** Active (non-paused) seconds since the session started, derived purely from timestamps. */
export function activeSeconds(t: TimingFields, now: Date | number = Date.now()): number {
  const nowMs = typeof now === "number" ? now : now.getTime();
  const end = t.endedAt ? ms(t.endedAt) : t.pausedAt ? ms(t.pausedAt) : nowMs;
  return Math.max(0, (end - ms(t.startedAt)) / 1000 - t.pausedTotalSec);
}

/** Seconds of the current pause that should be added to pausedTotalSec when resuming/ending. */
export function pendingPauseSec(t: TimingFields, now: Date | number = Date.now()): number {
  if (!t.pausedAt) return 0;
  const nowMs = typeof now === "number" ? now : now.getTime();
  return Math.max(0, Math.round((nowMs - ms(t.pausedAt)) / 1000));
}

export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mmss = `${String(m).padStart(h ? 2 : 1, "0")}:${String(sec).padStart(2, "0")}`;
  return h ? `${h}:${mmss}` : mmss;
}

/** Human prescription, e.g. "12–15 reps · 12 kg", "8 each side", "30 s". */
export function prescription(ex: Pick<SnapshotExercise, "repsMin" | "repsMax" | "durationSec" | "perSide" | "loadKg" | "sets">): string {
  let main: string;
  if (ex.durationSec != null) main = `${ex.durationSec} s`;
  else if (ex.repsMin != null && ex.repsMax != null && ex.repsMin !== ex.repsMax) main = `${ex.repsMin}–${ex.repsMax} reps`;
  else main = `${ex.repsMax ?? ex.repsMin ?? "?"} reps`;
  if (ex.perSide) main += " each side";
  if (ex.loadKg != null) main += ` · ${ex.loadKg} kg`;
  return main;
}

export function targetReps(ex: Pick<SnapshotExercise, "repsMin" | "repsMax" | "durationSec">): number | null {
  if (ex.durationSec != null) return null;
  return ex.repsMax ?? ex.repsMin ?? null;
}

export const initialCursor = (): Cursor => ({
  stepIndex: 0,
  phase: "work",
  phaseStartedActiveSec: 0,
  restEndsActiveSec: null,
});

/** Cursor after finishing (or skipping) the step at cursor.stepIndex. */
export function advanceCursor(steps: Step[], cursor: Cursor, activeNow: number, opts: { skipRest?: boolean } = {}): Cursor {
  const step = steps[cursor.stepIndex];
  const next = cursor.stepIndex + 1;
  if (!step || next >= steps.length) {
    return { stepIndex: steps.length, phase: "done", phaseStartedActiveSec: activeNow, restEndsActiveSec: null };
  }
  if (step.restAfterSec > 0 && !opts.skipRest) {
    return { stepIndex: next, phase: "rest", phaseStartedActiveSec: activeNow, restEndsActiveSec: activeNow + step.restAfterSec };
  }
  return { stepIndex: next, phase: "work", phaseStartedActiveSec: activeNow, restEndsActiveSec: null };
}

/** Advances past every remaining set of the current exercise (same round). */
export function skipExerciseSteps(steps: Step[], cursor: Cursor): Step[] {
  const cur = steps[cursor.stepIndex];
  if (!cur) return [];
  const out: Step[] = [];
  for (let i = cursor.stepIndex; i < steps.length; i++) {
    const s = steps[i];
    if (s.exerciseIndex !== cur.exerciseIndex || s.round !== cur.round) break;
    out.push(s);
  }
  return out;
}
