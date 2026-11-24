import OpenAI from "openai";
import type { ResponseInputItem, ResponseStreamEvent } from "openai/resources/responses/responses";
import { db } from "@/prisma/db";
import { HttpError } from "@/lib/http";
import { buildContextMessage, COACH_SYSTEM_PROMPT, NAME_SUGGESTION_PROMPT } from "@/lib/agent/prompt";
import { openAiTools, runTool, toolStatus, type ProfileProposal, type ToolContext, type ToolEvent } from "@/lib/agent/tools";
import { currentDraft, getConversation, type DraftHistoryEntry } from "@/lib/server/conversations";
import { getProfile } from "@/lib/server/profile";
import { recentWorkoutSummary } from "@/lib/server/sessions";
import type { RoutineDraft } from "@/lib/schemas";

export const MAX_TOOL_ITERATIONS = 12;
const HISTORY_CHAR_BUDGET = 60_000;

export type Source = { title: string; url: string };
export type ToolCallSummary = { id: string; name: string; label: string; ok: boolean | null };

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "status"; id: string; label: string; state: "start" | "done" | "error" }
  | { type: "draft"; version: number; draft: RoutineDraft }
  | { type: "profile_proposal"; proposal: ProfileProposal }
  | { type: "sources"; sources: Source[] }
  | { type: "done"; messageId: string }
  | { type: "error"; message: string };

export function model(): string {
  return process.env.OPENAI_MODEL || "gpt-6.2-sol";
}

let client: OpenAI | null = null;
function openai(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw new HttpError(503, "OPENAI_API_KEY is not configured on the server");
  client ??= new OpenAI();
  return client;
}

/** Keeps the newest messages that fit in the character budget (oldest trimmed first). */
export function trimHistory<T extends { content: string }>(messages: T[], budget = HISTORY_CHAR_BUDGET): T[] {
  const out: T[] = [];
  let used = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    used += messages[i].content.length;
    if (used > budget && out.length > 0) break;
    out.unshift(messages[i]);
  }
  return out;
}

/**
 * Runs one coach turn: persists the user message, loops model ↔ tools, streams events,
 * then persists the assistant message. Draft writes happen atomically inside tools.
 */
export async function* runCoachTurn(
  conversationId: string,
  userText: string,
  signal?: AbortSignal,
): AsyncGenerator<AgentEvent> {
  const ai = openai();
  const conv = await getConversation(conversationId);
  if (!conv) throw new HttpError(404, "Conversation not found");

  await db.orm.public.Message.create({ conversationId, role: "user", content: userText });

  const [profile, routine, recentWorkouts] = await Promise.all([
    getProfile(),
    conv.routineId ? db.orm.public.Routine.select("id", "name").first({ id: conv.routineId }) : null,
    recentWorkoutSummary({ limit: 5 }),
  ]);
  const { updatedAt: _u, ...profileData } = profile;
  const history = (conv.draftHistory as DraftHistoryEntry[] | null) ?? [];
  const original = conv.routineId ? (history.find((h) => h.source === "original")?.draft ?? null) : null;

  const context = buildContextMessage({
    profile: profileData,
    mode: routine ? { kind: "refine", routineName: routine.name } : { kind: "create" },
    original,
    draft: currentDraft(conv),
    draftVersion: conv.draftVersion,
    recentWorkouts,
  });

  const past = trimHistory(
    conv.messages.filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  );
  let input: ResponseInputItem[] = [
    { role: "developer", content: context },
    ...past.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userText },
  ];

  const queue: AgentEvent[] = [];
  const toolCtx: ToolContext = {
    conversationId,
    emit: (e: ToolEvent) => queue.push(e),
  };

  let text = "";
  let draftVersion: number | null = null;
  const sources = new Map<string, Source>();
  const toolCalls: ToolCallSummary[] = [];
  const proposals: ProfileProposal[] = [];
  let previousResponseId: string | undefined;
  let failed: string | null = null;

  try {
    for (let iteration = 0; iteration <= MAX_TOOL_ITERATIONS; iteration++) {
      const lastChance = iteration === MAX_TOOL_ITERATIONS;
      const stream = await ai.responses.create(
        {
          model: model(),
          instructions: COACH_SYSTEM_PROMPT,
          input,
          tools: openAiTools(),
          tool_choice: lastChance ? "none" : "auto",
          parallel_tool_calls: true,
          previous_response_id: previousResponseId,
          stream: true,
        },
        { signal },
      );

      const functionCalls: { call_id: string; name: string; arguments: string }[] = [];
      let iterationText = "";

      for await (const event of stream as AsyncIterable<ResponseStreamEvent>) {
        switch (event.type) {
          case "response.output_text.delta": {
            // Separate text produced across tool iterations.
            const delta = iterationText === "" && text ? `\n\n${event.delta}` : event.delta;
            iterationText += event.delta;
            text += delta;
            yield { type: "text", delta };
            break;
          }
          case "response.output_text.annotation.added": {
            const a = event.annotation as { type?: string; url?: string; title?: string };
            if (a?.type === "url_citation" && a.url && !sources.has(a.url)) {
              sources.set(a.url, { url: a.url, title: a.title || a.url });
              yield { type: "sources", sources: [...sources.values()] };
            }
            break;
          }
          case "response.output_item.added": {
            const item = event.item;
            if (item.type === "web_search_call") {
              yield { type: "status", id: item.id, label: "Searching the web…", state: "start" };
            } else if (item.type === "function_call") {
              yield { type: "status", id: item.call_id, label: toolStatus(item.name), state: "start" };
            }
            break;
          }
          case "response.output_item.done": {
            const item = event.item;
            if (item.type === "web_search_call") {
              const query = (item as { action?: { query?: string } }).action?.query;
              const label = query ? `Searched: ${query}` : "Searched the web";
              toolCalls.push({ id: item.id, name: "web_search", label, ok: true });
              yield { type: "status", id: item.id, label, state: "done" };
            } else if (item.type === "function_call") {
              functionCalls.push({ call_id: item.call_id, name: item.name, arguments: item.arguments });
            }
            break;
          }
          case "response.completed":
            previousResponseId = event.response.id;
            break;
          case "response.failed":
            throw new Error(event.response.error?.message ?? "Model response failed");
          case "error":
            throw new Error(event.message ?? "Model stream error");
        }
      }

      if (functionCalls.length === 0) break;

      // Run independent tool calls concurrently; draft writes are atomic per call.
      const outputs = await Promise.all(
        functionCalls.map(async (fc) => {
          const label = toolStatus(fc.name, fc.arguments);
          const r = await runTool(fc.name, fc.arguments, toolCtx);
          toolCalls.push({ id: fc.call_id, name: fc.name, label, ok: r.ok });
          return { fc, label, r };
        }),
      );
      for (const { fc, label, r } of outputs) {
        yield { type: "status", id: fc.call_id, label, state: r.ok ? "done" : "error" };
      }
      while (queue.length) {
        const e = queue.shift()!;
        if (e.type === "draft") draftVersion = e.version;
        if (e.type === "profile_proposal") proposals.push(e.proposal);
        yield e;
      }
      input = outputs.map(({ fc, r }) => ({ type: "function_call_output", call_id: fc.call_id, output: r.output }));
    }
  } catch (err) {
    if (signal?.aborted) failed = "Request was cancelled.";
    else {
      console.error("[coach]", err);
      failed = err instanceof Error ? err.message : "The coach failed to respond.";
    }
  }

  const content = text.trim() || (failed ? "" : draftVersion ? "Draft updated." : "(no reply)");
  const message = await db.orm.public.Message.create({
    conversationId,
    role: "assistant",
    content: failed ? `${content}${content ? "\n\n" : ""}⚠️ ${failed}` : content,
    toolCalls: { calls: toolCalls, proposals } as never,
    sources: [...sources.values()] as never,
    draftVersion,
  });
  // Touch the row so updatedAt (auto-managed) reflects the latest activity.
  const fresh = await db.orm.public.Conversation.select("title").first({ id: conversationId });
  await db.orm.public.Conversation.where({ id: conversationId }).update({ title: fresh?.title ?? null });

  if (failed) yield { type: "error", message: failed };
  yield { type: "done", messageId: message.id };
}

export async function suggestRoutineName(draft: RoutineDraft): Promise<string> {
  try {
    const res = await openai().responses.create({
      model: model(),
      instructions: NAME_SUGGESTION_PROMPT,
      input: JSON.stringify({
        name: draft.name,
        goal: draft.goal,
        format: draft.format,
        estimatedMinutes: draft.estimatedMinutes,
        exercises: draft.exercises.map((e) => ({ name: e.name, pattern: e.movementPattern, equipment: e.equipment })),
      }),
    });
    const name = res.output_text.trim().replace(/^["']|["']$/g, "").slice(0, 60);
    return name || draft.name;
  } catch {
    return draft.name;
  }
}
