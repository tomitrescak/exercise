import type { ExerciseDraft, RoutineDraft } from "@/lib/schemas";
import type { SnapshotExercise } from "@/lib/workout";

export const exDraft = (o: Partial<ExerciseDraft> = {}): ExerciseDraft => ({
  name: "Goblet squat",
  movementPattern: "squat",
  primaryMuscles: ["quads"],
  equipment: "Kettlebell",
  loadKg: 12,
  sets: 1,
  repsMin: 10,
  repsMax: 15,
  durationSec: null,
  perSide: false,
  tempo: null,
  restSec: 30,
  targetRir: 2,
  cues: [],
  safetyNotes: null,
  youtubeVideoId: "abcdefghijk",
  youtubeTitle: "t",
  youtubeChannel: "c",
  videoDurationSec: 60,
  ...o,
});

export const draft = (o: Partial<RoutineDraft> = {}): RoutineDraft => ({
  name: "R",
  description: null,
  goal: "hypertrophy",
  format: "CIRCUIT",
  rounds: 2,
  restBetweenRoundsSec: 90,
  estimatedMinutes: 30,
  coachNotes: null,
  rating: null,
  exercises: [exDraft()],
  ...o,
});

export const snapEx = (o: Partial<SnapshotExercise> = {}): SnapshotExercise => ({
  id: "e",
  ...(exDraft() as Omit<SnapshotExercise, "id">),
  youtubeVideoId: "abcdefghijk",
  youtubeTitle: "t",
  youtubeChannel: "c",
  ...o,
});
