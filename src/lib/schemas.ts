import { z } from "zod";

export const MOVEMENT_PATTERNS = [
  "squat",
  "hinge",
  "lunge",
  "push_horizontal",
  "push_vertical",
  "pull_horizontal",
  "pull_vertical",
  "core",
  "carry",
  "mobility",
  "conditioning",
] as const;

export const ROUTINE_FORMATS = ["CIRCUIT", "STRAIGHT_SETS"] as const;

/**
 * Every optional field is `nullable` (not `optional`) so the same schema can be
 * used as an OpenAI strict-mode function schema, where all keys are required.
 */
export const ExerciseDraftSchema = z.object({
  name: z.string().min(1).max(80),
  movementPattern: z.enum(MOVEMENT_PATTERNS),
  primaryMuscles: z.array(z.string().min(1).max(40)).max(6),
  equipment: z.string().max(80).nullable(),
  loadKg: z.number().min(0).max(500).nullable(),
  sets: z.number().int().min(1).max(10),
  repsMin: z.number().int().min(1).max(100).nullable(),
  repsMax: z.number().int().min(1).max(100).nullable(),
  durationSec: z.number().int().min(5).max(1800).nullable(),
  perSide: z.boolean(),
  tempo: z.string().max(40).describe("Tempo notation only, e.g. \"3-1-1-0\" (eccentric-pause-concentric-pause). Put other guidance in cues.").nullable(),
  restSec: z.number().int().min(0).max(600),
  targetRir: z.number().int().min(0).max(5).nullable(),
  cues: z.array(z.string().min(1).max(160)).max(5),
  safetyNotes: z.string().max(500).nullable(),
  youtubeVideoId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{11}$/, "Must be an 11-character YouTube video ID")
    .nullable(),
  youtubeTitle: z.string().max(200).nullable(),
  youtubeChannel: z.string().max(120).nullable(),
  videoDurationSec: z.number().int().min(0).nullable(),
});
export type ExerciseDraft = z.infer<typeof ExerciseDraftSchema>;

export const RatingSchema = z.object({
  overall: z.number().min(0).max(10),
  balance: z.number().min(0).max(10),
  summary: z.string().max(1000),
});
export type Rating = z.infer<typeof RatingSchema>;

export const RoutineDraftBaseSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(1000).nullable(),
  goal: z.string().min(1).max(80).describe("Short label, e.g. \"hypertrophy\" or \"general fitness\"."),
  format: z.enum(ROUTINE_FORMATS),
  rounds: z.number().int().min(1).max(10),
  restBetweenRoundsSec: z.number().int().min(0).max(600),
  estimatedMinutes: z.number().int().min(1).max(180),
  coachNotes: z.string().max(3000).nullable(),
  rating: RatingSchema.nullable(),
  exercises: z.array(ExerciseDraftSchema).min(1).max(20),
});

/** Cross-field rules that JSON Schema can't express. */
export const RoutineDraftSchema = RoutineDraftBaseSchema.superRefine((draft, ctx) => {
  draft.exercises.forEach((ex, i) => {
    const hasReps = ex.repsMin != null || ex.repsMax != null;
    const hasDuration = ex.durationSec != null;
    if (hasReps === hasDuration) {
      ctx.addIssue({
        code: "custom",
        path: ["exercises", i],
        message: `"${ex.name}": set either reps (repsMin/repsMax) or durationSec, not both or neither`,
      });
    }
    if (ex.repsMin != null && ex.repsMax != null && ex.repsMin > ex.repsMax) {
      ctx.addIssue({
        code: "custom",
        path: ["exercises", i, "repsMin"],
        message: `"${ex.name}": repsMin must be ≤ repsMax`,
      });
    }
  });
});
export type RoutineDraft = z.infer<typeof RoutineDraftSchema>;

/** Indices of exercises that still lack a video (draft is unsaveable). */
export function exercisesMissingVideo(draft: RoutineDraft): number[] {
  return draft.exercises.flatMap((ex, i) => (ex.youtubeVideoId ? [] : [i]));
}

export const EquipmentItemSchema = z.object({
  name: z.string().min(1).max(60),
  loadsKg: z.array(z.number().min(0).max(500)).max(20).default([]),
  maxKg: z.number().min(0).max(500).nullable().default(null),
  adjustable: z.boolean().default(false),
});
export type EquipmentItem = z.infer<typeof EquipmentItemSchema>;

export const ProfileSchema = z.object({
  displayName: z.string().max(60).nullable(),
  ageYears: z.number().int().min(10).max(110).nullable(),
  sex: z.string().max(20).nullable(),
  weightKg: z.number().min(20).max(400).nullable(),
  heightCm: z.number().min(80).max(260).nullable(),
  experienceLevel: z.enum(["beginner", "intermediate", "advanced"]),
  primaryGoal: z.string().min(1).max(60),
  focusNotes: z.string().max(500).nullable(),
  equipment: z.array(EquipmentItemSchema).max(30),
  sessionMaxMinutes: z.number().int().min(5).max(240),
  sessionsPerWeek: z.number().int().min(1).max(14),
  healthConstraints: z.string().max(4000).nullable(),
  benchmarks: z.record(z.string(), z.union([z.number(), z.string()])).nullable(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const ProfilePatchSchema = ProfileSchema.partial();

export const CursorSchema = z.object({
  stepIndex: z.number().int().min(0),
  phase: z.enum(["work", "rest", "done"]),
  /** Active (non-paused) seconds since session start when the phase began. */
  phaseStartedActiveSec: z.number().min(0),
  /** Active-second mark at which the current rest ends. */
  restEndsActiveSec: z.number().min(0).nullable(),
});
export type Cursor = z.infer<typeof CursorSchema>;

export const SetLogInputSchema = z.object({
  exerciseId: z.string().min(1),
  exerciseName: z.string().min(1),
  round: z.number().int().min(1),
  setIndex: z.number().int().min(1),
  side: z.enum(["", "left", "right"]),
  targetReps: z.number().int().min(0).nullable(),
  actualReps: z.number().int().min(0).max(1000).nullable(),
  loadKg: z.number().min(0).max(500).nullable(),
  durationSec: z.number().int().min(0).max(36000).nullable(),
  skipped: z.boolean(),
  cursor: CursorSchema,
});
export type SetLogInput = z.infer<typeof SetLogInputSchema>;
