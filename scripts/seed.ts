/**
 * Seeds the profile and two starter routines from the originating conversation (SPEC §1.1).
 * Idempotent: an existing profile is left untouched, routines are skipped if one with the same name exists.
 * Videos are found and verified through the YouTube Data API — IDs are never hard-coded.
 */
import "dotenv/config";
import { db } from "@/prisma/db";
import { getProfile, saveProfile } from "@/lib/server/profile";
import { createRoutineFromDraft, listRoutines } from "@/lib/server/routines";
import { searchVideos, verifyVideo } from "@/lib/youtube";
import type { ExerciseDraft, RoutineDraft } from "@/lib/schemas";

type Ex = Omit<ExerciseDraft, "youtubeVideoId" | "youtubeTitle" | "youtubeChannel" | "videoDurationSec"> & { videoQuery: string };
type Spec = Omit<RoutineDraft, "exercises"> & { exercises: Ex[] };

const ex = (e: Partial<Ex> & Pick<Ex, "name" | "movementPattern" | "primaryMuscles" | "sets" | "restSec" | "videoQuery">): Ex => ({
  equipment: null,
  loadKg: null,
  repsMin: null,
  repsMax: null,
  durationSec: null,
  perSide: false,
  tempo: null,
  targetRir: null,
  cues: [],
  safetyNotes: null,
  ...e,
});

const ORIGINAL: Spec = {
  name: "Original circuit (as reviewed)",
  description: "The routine reviewed in the originating conversation: 3-round kettlebell / push-up / core circuit, ~30 min.",
  goal: "general_fitness",
  format: "CIRCUIT",
  rounds: 3,
  restBetweenRoundsSec: 90,
  estimatedMinutes: 30,
  coachNotes:
    "Rated ~7/10 for general fitness and 6/10 for balance: no knee-dominant leg work, more push than pull, and a lot of direct core work. Ask the coach to rebalance it.",
  rating: { overall: 7, balance: 6, summary: "Good conditioning base; missing squat/lunge patterns, push-heavy, core-heavy." },
  exercises: [
    ex({ name: "Kettlebell overhead rotation", movementPattern: "mobility", primaryMuscles: ["shoulders", "core"], equipment: "Kettlebell", loadKg: 12, sets: 1, repsMin: 10, repsMax: 10, restSec: 20, videoQuery: "kettlebell overhead rotation exercise how to" }),
    ex({ name: "Kettlebell swing", movementPattern: "hinge", primaryMuscles: ["glutes", "hamstrings"], equipment: "Kettlebell", loadKg: 12, sets: 1, repsMin: 15, repsMax: 15, restSec: 20, cues: ["Hinge at the hips, not a squat", "Snap the hips to float the bell"], videoQuery: "russian kettlebell swing proper form tutorial" }),
    ex({ name: "Kettlebell halo", movementPattern: "mobility", primaryMuscles: ["shoulders"], equipment: "Kettlebell", loadKg: 12, sets: 1, repsMin: 10, repsMax: 10, restSec: 20, videoQuery: "kettlebell halo exercise tutorial" }),
    ex({ name: "Kettlebell simulated throw", movementPattern: "conditioning", primaryMuscles: ["core", "shoulders"], equipment: "Kettlebell", loadKg: 12, sets: 1, repsMin: 10, repsMax: 10, perSide: true, restSec: 20, videoQuery: "kettlebell rotational slam throw exercise" }),
    ex({ name: "Wide push-up", movementPattern: "push_horizontal", primaryMuscles: ["chest", "shoulders"], sets: 1, repsMin: 30, repsMax: 30, restSec: 30, videoQuery: "wide grip push up proper form" }),
    ex({ name: "Close-grip push-up", movementPattern: "push_horizontal", primaryMuscles: ["triceps", "chest"], sets: 1, repsMin: 10, repsMax: 10, restSec: 30, videoQuery: "close grip push up proper form" }),
    ex({ name: "Sit-up", movementPattern: "core", primaryMuscles: ["abs"], sets: 1, repsMin: 20, repsMax: 20, restSec: 20, videoQuery: "sit up proper form tutorial" }),
    ex({ name: "Lying leg raise", movementPattern: "core", primaryMuscles: ["abs", "hip flexors"], sets: 1, repsMin: 12, repsMax: 12, restSec: 20, videoQuery: "lying leg raise proper form" }),
    ex({ name: "Weighted single-leg crunch", movementPattern: "core", primaryMuscles: ["abs"], equipment: "Kettlebell", loadKg: 12, sets: 1, repsMin: 10, repsMax: 10, perSide: true, restSec: 20, videoQuery: "weighted single leg crunch exercise" }),
    ex({ name: "Barbell curl", movementPattern: "pull_vertical", primaryMuscles: ["biceps"], equipment: "Barbell", loadKg: 24, sets: 1, repsMin: 10, repsMax: 10, restSec: 30, videoQuery: "barbell curl proper form tutorial" }),
  ],
};

const HYPERTROPHY: Spec = {
  name: "Full-body hypertrophy (12 kg KB / 24 kg BB)",
  description: "Balanced full-body plan from the conversation's recommendation: every major pattern, 2–3 RIR.",
  goal: "hypertrophy",
  format: "CIRCUIT",
  rounds: 3,
  restBetweenRoundsSec: 120,
  estimatedMinutes: 35,
  coachNotes:
    "Work 2–3 reps short of failure (RIR 2–3). When you hit the top of a rep range on every set for two sessions, slow the tempo or add load/reps.",
  rating: null,
  exercises: [
    ex({ name: "Kettlebell goblet squat", movementPattern: "squat", primaryMuscles: ["quads", "glutes"], equipment: "Kettlebell", loadKg: 12, sets: 1, repsMin: 12, repsMax: 20, tempo: "3-1-1-0", restSec: 45, targetRir: 2, cues: ["Bell at chest, elbows inside knees", "Sit between the hips, chest tall"], videoQuery: "kettlebell goblet squat proper form tutorial" }),
    ex({ name: "Push-up", movementPattern: "push_horizontal", primaryMuscles: ["chest", "triceps", "shoulders"], sets: 1, repsMin: 10, repsMax: 25, restSec: 45, targetRir: 2, cues: ["Rigid plank from head to heels", "Elbows ~45° from the torso"], videoQuery: "push up proper form tutorial" }),
    ex({ name: "Barbell bent-over row", movementPattern: "pull_horizontal", primaryMuscles: ["lats", "upper back"], equipment: "Barbell", loadKg: 24, sets: 1, repsMin: 10, repsMax: 15, restSec: 45, targetRir: 2, cues: ["Hinge to ~45°, neutral spine", "Pull the bar to the lower ribs"], videoQuery: "barbell bent over row proper form tutorial" }),
    ex({ name: "Reverse lunge", movementPattern: "lunge", primaryMuscles: ["quads", "glutes"], equipment: "Kettlebell", loadKg: 12, sets: 1, repsMin: 8, repsMax: 12, perSide: true, restSec: 45, targetRir: 2, cues: ["Step back, front shin vertical", "Drive through the front heel"], videoQuery: "kettlebell reverse lunge proper form" }),
    ex({ name: "Barbell Romanian deadlift", movementPattern: "hinge", primaryMuscles: ["hamstrings", "glutes"], equipment: "Barbell", loadKg: 24, sets: 1, repsMin: 10, repsMax: 15, tempo: "3-0-1-0", restSec: 45, targetRir: 2, cues: ["Soft knees, push the hips back", "Bar stays close to the legs"], videoQuery: "barbell romanian deadlift proper form tutorial" }),
    ex({ name: "Barbell curl", movementPattern: "pull_vertical", primaryMuscles: ["biceps"], equipment: "Barbell", loadKg: 24, sets: 1, repsMin: 8, repsMax: 12, restSec: 45, targetRir: 2, cues: ["Elbows pinned to the sides", "No hip swing"], videoQuery: "barbell curl proper form tutorial" }),
    ex({ name: "Dead bug", movementPattern: "core", primaryMuscles: ["abs"], sets: 1, repsMin: 8, repsMax: 12, perSide: true, restSec: 60, cues: ["Low back pressed into the floor", "Exhale as the limbs extend"], videoQuery: "dead bug exercise proper form" }),
  ],
};

async function findVideo(name: string, query: string) {
  const used = new Set<string>();
  for (const q of [query, `how to do ${name} exercise`, `${name} technique`]) {
    for (const v of await searchVideos(q, 8)) {
      if (used.has(v.videoId)) continue;
      used.add(v.videoId);
      const r = await verifyVideo(v.videoId);
      if (r.ok) return r.video;
    }
  }
  return null;
}

async function seedRoutine(spec: Spec, existing: Set<string>) {
  if (existing.has(spec.name)) {
    console.log(`• "${spec.name}" already exists — skipped`);
    return;
  }
  console.log(`• Finding videos for "${spec.name}"`);
  const exercises: ExerciseDraft[] = [];
  for (const { videoQuery, ...e } of spec.exercises) {
    const v = await findVideo(e.name, videoQuery);
    if (!v) throw new Error(`No verified video found for "${e.name}" (query: ${videoQuery})`);
    console.log(`  ✓ ${e.name}: ${v.title} — ${v.channel}`);
    exercises.push({ ...e, youtubeVideoId: v.videoId, youtubeTitle: v.title, youtubeChannel: v.channel, videoDurationSec: v.durationSec });
  }
  const r = await createRoutineFromDraft({ ...spec, exercises });
  console.log(`• Created "${r.name}" (${r.id})`);
}

async function main() {
  const profile = await getProfile();
  if (profile.updatedAt) {
    console.log("• Profile already exists — left untouched");
  } else {
    await saveProfile({
      displayName: null,
      ageYears: null,
      sex: null,
      weightKg: 81,
      heightCm: null,
      experienceLevel: "intermediate",
      primaryGoal: "hypertrophy",
      focusNotes: "Chest priority",
      equipment: [
        { name: "Kettlebell", loadsKg: [12], maxKg: null, adjustable: false },
        { name: "Barbell", loadsKg: [], maxKg: 24, adjustable: true },
      ],
      sessionMaxMinutes: 35,
      sessionsPerWeek: 3,
      healthConstraints: null,
      benchmarks: { pushUpMax: 30 },
    });
    console.log("• Profile created (health constraints left empty — fill them in on /profile)");
  }

  if (!process.env.YOUTUBE_API_KEY) {
    console.log("\n⚠ YOUTUBE_API_KEY is not set — skipping routines (every exercise needs a verified video).");
    console.log("  Set it in .env and run `pnpm db:seed` again.");
    return;
  }
  const existing = new Set((await listRoutines({ includeArchived: true })).map((r) => r.name));
  for (const spec of [ORIGINAL, HYPERTROPHY]) await seedRoutine(spec, existing);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.close());
