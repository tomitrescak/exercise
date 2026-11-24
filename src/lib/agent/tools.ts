import { z, type ZodType } from "zod";
import type { FunctionTool, Tool } from "openai/resources/responses/responses";
import { ProfilePatchSchema, RoutineDraftBaseSchema, RoutineDraftSchema, type RoutineDraft } from "@/lib/schemas";
import { getProfile } from "@/lib/server/profile";
import { recentWorkoutSummary } from "@/lib/server/sessions";
import { addVerifiedVideo, getVerifiedVideoIds, setDraft } from "@/lib/server/conversations";
import { searchVideos, verifyVideo, videoProblem, YouTubeError } from "@/lib/youtube";

const ALLOWED_KEYS = new Set([
  "type",
  "properties",
  "required",
  "items",
  "enum",
  "anyOf",
  "description",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "pattern",
  "minItems",
  "maxItems",
  "additionalProperties",
]);

/** Converts a Zod schema into an OpenAI strict-mode compatible JSON schema. */
export function toStrictJsonSchema(schema: ZodType): Record<string, unknown> {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (!ALLOWED_KEYS.has(k)) continue;
      out[k] = k === "properties" ? Object.fromEntries(Object.entries(v as object).map(([pk, pv]) => [pk, walk(pv)])) : walk(v);
    }
    if (out.type === "object") {
      out.additionalProperties = false;
      out.required = Object.keys((out.properties as object) ?? {});
    }
    return out;
  };
  return walk(z.toJSONSchema(schema, { target: "draft-7", io: "input" })) as Record<string, unknown>;
}

const GetHistoryArgs = z.object({
  routineId: z.string().nullable(),
  limit: z.number().int().min(1).max(20),
});
const SearchVideosArgs = z.object({
  query: z.string().min(3).max(150),
  maxResults: z.number().int().min(1).max(8),
});
const VerifyVideoArgs = z.object({ videoId: z.string() });
const UpdateDraftArgs = z.object({ draft: RoutineDraftBaseSchema });
const UpdateDraftStrictArgs = z.object({ draft: RoutineDraftSchema });

// All fields nullable so strict mode accepts the schema; nulls mean "no change".
const ProfileProposalFields = z.object({
  weightKg: z.number().nullable(),
  heightCm: z.number().nullable(),
  ageYears: z.number().int().nullable(),
  experienceLevel: z.enum(["beginner", "intermediate", "advanced"]).nullable(),
  primaryGoal: z.string().nullable(),
  focusNotes: z.string().nullable(),
  sessionMaxMinutes: z.number().int().nullable(),
  sessionsPerWeek: z.number().int().nullable(),
  healthConstraints: z.string().nullable(),
  equipment: z
    .array(
      z.object({
        name: z.string(),
        loadsKg: z.array(z.number()),
        maxKg: z.number().nullable(),
        adjustable: z.boolean(),
      }),
    )
    .nullable(),
  benchmarks: z.array(z.object({ key: z.string(), value: z.number() })).nullable(),
});
const ProposeProfileArgs = z.object({ summary: z.string().max(300), changes: ProfileProposalFields });

export type ProfileProposal = { summary: string; patch: z.infer<typeof ProfilePatchSchema> };

export type ToolEvent =
  | { type: "draft"; version: number; draft: RoutineDraft }
  | { type: "profile_proposal"; proposal: ProfileProposal };

export type ToolContext = {
  conversationId: string;
  emit: (e: ToolEvent) => void;
  /** Whether at least one video lookup failed for infrastructure reasons this turn. */
  videoToolsUnavailable?: boolean;
};

type ToolDef = {
  name: string;
  description: string;
  args: ZodType;
  /** Optional schema advertised to the model, if different from `args`. */
  modelSchema?: ZodType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each tool narrows its own args via `args.parse`
  status: (args: any) => string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: (args: any, ctx: ToolContext) => Promise<unknown>;
};

const TOOLS: ToolDef[] = [
  {
    name: "get_user_profile",
    description: "Returns the user's current profile (body data, goal, equipment, time cap, health constraints, benchmarks).",
    args: z.object({}),
    status: () => "Reading profile…",
    run: async () => {
      const { updatedAt: _u, ...p } = await getProfile();
      return p;
    },
  },
  {
    name: "get_workout_history",
    description:
      "Returns recent completed workouts with per-exercise reps and load. Use for progressive-overload suggestions. routineId null = all routines.",
    args: GetHistoryArgs,
    status: () => "Reviewing workout history…",
    run: async (a: z.infer<typeof GetHistoryArgs>) => recentWorkoutSummary({ routineId: a.routineId, limit: a.limit }),
  },
  {
    name: "search_youtube_videos",
    description:
      "Searches YouTube for embeddable exercise technique videos. Returns candidates with title, channel, duration and view count. Only IDs returned here may be used.",
    args: SearchVideosArgs,
    status: (a) => (a?.query ? `Finding video: ${String(a.query).slice(0, 50)}…` : "Finding video…"),
    run: async (a: z.infer<typeof SearchVideosArgs>) => {
      const results = await searchVideos(a.query, a.maxResults);
      return results.map((v) => ({ ...v, problem: videoProblem(v) }));
    },
  },
  {
    name: "verify_youtube_video",
    description:
      "Confirms a YouTube video exists, is public, embeddable and 30 s–10 min long. Must be called for every video before it is used in the draft.",
    args: VerifyVideoArgs,
    status: () => "Verifying video…",
    run: async (a: z.infer<typeof VerifyVideoArgs>, ctx) => {
      const r = await verifyVideo(a.videoId);
      if (!r.ok) return { ok: false, videoId: r.videoId, reason: r.reason };
      await addVerifiedVideo(ctx.conversationId, r.video.videoId);
      return { ok: true, ...r.video };
    },
  },
  {
    name: "update_routine_draft",
    description:
      "Replaces the entire routine draft. Send the full routine every time (not a patch). Every non-null youtubeVideoId must have been verified with verify_youtube_video in this conversation.",
    args: UpdateDraftStrictArgs,
    modelSchema: UpdateDraftArgs,
    status: () => "Updating routine draft…",
    run: async (a: z.infer<typeof UpdateDraftStrictArgs>, ctx) => {
      const verified = await getVerifiedVideoIds(ctx.conversationId);
      const unverified = a.draft.exercises.filter((e) => e.youtubeVideoId && !verified.has(e.youtubeVideoId));
      if (unverified.length) {
        return {
          ok: false,
          error:
            "These video IDs were not verified in this conversation. Call verify_youtube_video for each (only IDs from search_youtube_videos), then retry: " +
            unverified.map((e) => `${e.name} → ${e.youtubeVideoId}`).join("; "),
        };
      }
      const version = await setDraft(ctx.conversationId, a.draft, "agent");
      ctx.emit({ type: "draft", version, draft: a.draft });
      const missing = a.draft.exercises.filter((e) => !e.youtubeVideoId).map((e) => e.name);
      return { ok: true, version, exercisesMissingVideo: missing };
    },
  },
  {
    name: "propose_profile_update",
    description:
      "Proposes profile changes when the user shares new personal data (weight, max reps, equipment, injury). Set unchanged fields to null. The user must confirm in the UI before anything is applied.",
    args: ProposeProfileArgs,
    status: () => "Proposing profile update…",
    run: async (a: z.infer<typeof ProposeProfileArgs>, ctx) => {
      const { benchmarks, ...rest } = a.changes;
      const patch: Record<string, unknown> = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== null));
      if (benchmarks?.length) {
        const current = (await getProfile()).benchmarks ?? {};
        patch.benchmarks = { ...current, ...Object.fromEntries(benchmarks.map((b) => [b.key, b.value])) };
      }
      const parsed = ProfilePatchSchema.safeParse(patch);
      if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
      ctx.emit({ type: "profile_proposal", proposal: { summary: a.summary, patch: parsed.data } });
      return { ok: true, note: "Shown to the user for confirmation; not applied yet." };
    },
  },
];

const byName = new Map(TOOLS.map((t) => [t.name, t]));

export function openAiTools(): Tool[] {
  const fns: FunctionTool[] = TOOLS.map((t) => ({
    type: "function",
    name: t.name,
    description: t.description,
    strict: true,
    parameters: toStrictJsonSchema(t.modelSchema ?? t.args),
  }));
  return [{ type: "web_search" }, ...fns];
}

export function toolStatus(name: string, rawArgs?: string): string {
  const t = byName.get(name);
  if (!t) return `Running ${name}…`;
  let args: unknown = {};
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    /* partial args */
  }
  return t.status(args);
}

/** Runs a tool call; never throws — errors are returned to the model so it can self-correct. */
export async function runTool(name: string, rawArgs: string, ctx: ToolContext): Promise<{ output: string; ok: boolean }> {
  const r = await runToolInner(name, rawArgs, ctx);
  if (!r.ok && process.env.COACH_DEBUG) console.warn(`[tool ${name}] rejected: ${r.output.slice(0, 2000)}`);
  return r;
}

async function runToolInner(name: string, rawArgs: string, ctx: ToolContext): Promise<{ output: string; ok: boolean }> {
  const t = byName.get(name);
  if (!t) return { ok: false, output: JSON.stringify({ ok: false, error: `Unknown tool ${name}` }) };
  let json: unknown;
  try {
    json = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return { ok: false, output: JSON.stringify({ ok: false, error: "Arguments were not valid JSON" }) };
  }
  const parsed = t.args.safeParse(json);
  if (!parsed.success) {
    return { ok: false, output: JSON.stringify({ ok: false, error: `Invalid arguments:\n${z.prettifyError(parsed.error)}` }) };
  }
  try {
    const result = await t.run(parsed.data, ctx);
    const ok = !(result && typeof result === "object" && "ok" in result && (result as { ok: boolean }).ok === false);
    return { ok, output: JSON.stringify(result) };
  } catch (err) {
    const message = err instanceof YouTubeError ? err.message : "Tool failed unexpectedly";
    if (err instanceof YouTubeError) ctx.videoToolsUnavailable = true;
    else console.error(`[tool ${name}]`, err);
    return { ok: false, output: JSON.stringify({ ok: false, error: message }) };
  }
}
