"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, Globe, Loader2, Send, Square, UserCog } from "lucide-react";
import { api } from "@/lib/client/api";
import { postSse } from "@/lib/client/sse";
import type { ChatMessage, ConversationView, ProfileProposal, Source } from "@/lib/client/types";
import { Badge, Button, cx, ErrorBox, Spinner, Textarea } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { DraftPanel } from "./draft-panel";

type Status = { id: string; label: string; state: "start" | "done" | "error" };
type Streaming = { userText: string; text: string; statuses: Status[]; sources: Source[]; proposals: ProfileProposal[]; error: string | null };

export function CoachView() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const key = ["conversation", id];
  const q = useQuery({ queryKey: key, queryFn: () => api<ConversationView>(`/api/conversations/${id}`) });

  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<Streaming | null>(null);
  const [tab, setTab] = useState<"chat" | "draft">("chat");
  const abortRef = useRef<AbortController | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const autoSent = useRef(false);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || abortRef.current) return;
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setSending(true);
      setInput("");
      let s: Streaming = { userText: content, text: "", statuses: [], sources: [], proposals: [], error: null };
      const update = (patch: Partial<Streaming>) => setStreaming((s = { ...s, ...patch }));
      update({});
      try {
        for await (const e of postSse(`/api/conversations/${id}/messages`, { content }, ctrl.signal)) {
          switch (e.type) {
            case "text":
              update({ text: s.text + e.delta });
              break;
            case "status": {
              const others = s.statuses.filter((x) => x.id !== e.id);
              update({ statuses: [...others, { id: e.id, label: e.label, state: e.state }] });
              break;
            }
            case "sources":
              update({ sources: e.sources });
              break;
            case "profile_proposal":
              update({ proposals: [...s.proposals, e.proposal] });
              break;
            case "draft":
              qc.setQueryData<ConversationView>(key, (old) => (old ? { ...old, draft: e.draft, draftVersion: e.version } : old));
              break;
            case "error":
              update({ error: e.message });
              break;
          }
        }
      } catch (err) {
        if (!ctrl.signal.aborted) update({ error: err instanceof Error ? err.message : String(err) });
      } finally {
        abortRef.current = null;
        setSending(false);
        await qc.invalidateQueries({ queryKey: key });
        setStreaming((cur) => (cur?.error ? cur : null));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, qc],
  );

  // Auto-send the first message coming from /coach?send=...
  useEffect(() => {
    const first = search.get("send");
    if (first && q.data && !autoSent.current) {
      autoSent.current = true;
      router.replace(`/coach/${id}`);
      if (q.data.messages.length === 0) void send(first);
    }
  }, [search, q.data, id, router, send]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [q.data?.messages.length, streaming?.text, streaming?.statuses.length]);

  if (q.isPending) return <Spinner />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const conv = q.data;
  const busy = sending || (!!streaming && !streaming.error);

  return (
    <div className="-my-2">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold break-words">{conv.title ?? "New routine"}</h1>
          {conv.routine && (
            <p className="text-sm text-muted">
              Refining <Link className="underline" href={`/routines/${conv.routine.id}`}>{conv.routine.name}</Link> — the original is never changed.
            </p>
          )}
        </div>
        <div className="flex w-full rounded-lg border border-border p-0.5 sm:w-auto lg:hidden">
          {(["chat", "draft"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cx("flex-1 rounded-md px-3 py-1.5 text-sm capitalize sm:flex-none", tab === t && "bg-surface-2 font-medium")}>
              {t}
              {t === "draft" && conv.draft && ` v${conv.draftVersion}`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section
          className={cx(
            // Phones: the page scrolls and the composer sticks above the tab bar. Larger screens: fixed-height panel.
            "flex min-h-[50dvh] flex-col rounded-xl border border-border bg-surface sm:h-[calc(100dvh-12rem)]",
            tab !== "chat" && "hidden lg:flex",
          )}
        >
          <div className="flex-1 space-y-4 p-4 sm:overflow-y-auto">
            {conv.messages.length === 0 && !streaming && (
              <p className="text-sm text-muted">
                {conv.routine ? "Ask for changes, e.g. “swap sit-ups for something easier on the back” or “fit it in 20 minutes”." : "Describe the routine you want."}
              </p>
            )}
            {conv.messages.map((m) => (
              <MessageBubble key={m.id} m={m} />
            ))}
            {streaming && (
              <>
                {(busy || conv.messages.filter((m) => m.role === "user").at(-1)?.content !== streaming.userText) && (
                  <MessageBubble m={{ id: "pending", role: "user", content: streaming.userText, toolCalls: null, sources: null, draftVersion: null, createdAt: "" }} />
                )}
                <div className="space-y-2">
                  <StatusChips statuses={streaming.statuses} />
                  {streaming.text ? (
                    <div className="rounded-xl bg-surface-2 p-3">
                      <Markdown text={streaming.text} />
                    </div>
                  ) : (
                    !streaming.error && (
                      <div className="flex items-center gap-2 text-sm text-muted">
                        <Loader2 className="size-4 animate-spin" /> Coach is thinking…
                      </div>
                    )
                  )}
                  <Sources sources={streaming.sources} />
                  {streaming.proposals.map((p, i) => (
                    <ProposalCard key={i} p={p} />
                  ))}
                  {streaming.error && <ErrorBox error={streaming.error} onRetry={() => { setStreaming(null); void send(streaming.userText); }} />}
                </div>
              </>
            )}
            <div ref={bottomRef} className="scroll-mb-40 sm:scroll-mb-0" />
          </div>
          <form
            className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] flex gap-2 rounded-b-xl border-t border-border bg-surface p-3 sm:static"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <Textarea
              rows={2}
              className="resize-none"
              placeholder={conv.draft ? "Ask the coach to change the routine…" : "Message the coach…"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
            />
            {busy ? (
              <Button type="button" onClick={() => abortRef.current?.abort()} aria-label="Stop">
                <Square className="size-4" />
              </Button>
            ) : (
              <Button type="submit" variant="primary" disabled={!input.trim()} aria-label="Send">
                <Send className="size-4" />
              </Button>
            )}
          </form>
        </section>

        <section className={cx(tab !== "draft" && "hidden lg:block")}>
          <DraftPanel conv={conv} busy={busy} />
        </section>
      </div>
    </div>
  );
}

function MessageBubble({ m }: { m: ChatMessage }) {
  if (m.role === "user") {
    return (
      <div className="ml-auto max-w-[85%] rounded-xl bg-accent px-3 py-2 text-sm whitespace-pre-wrap text-accent-fg">{m.content}</div>
    );
  }
  const calls = m.toolCalls?.calls ?? [];
  return (
    <div className="space-y-2">
      {calls.length > 0 && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer select-none">
            {calls.length} tool call(s){m.draftVersion ? ` · produced draft v${m.draftVersion}` : ""}
          </summary>
          <StatusChips statuses={calls.map((c) => ({ id: c.id, label: c.label, state: c.ok === false ? "error" : "done" }))} />
        </details>
      )}
      <div className="rounded-xl bg-surface-2 p-3">
        <Markdown text={m.content} />
      </div>
      <Sources sources={m.sources ?? []} />
      {m.toolCalls?.proposals?.map((p, i) => (
        <ProposalCard key={i} p={p} />
      ))}
    </div>
  );
}

function StatusChips({ statuses }: { statuses: Status[] }) {
  if (!statuses.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {statuses.map((s) => (
        <Badge key={s.id} tone={s.state === "error" ? "danger" : s.state === "done" ? "neutral" : "accent"}>
          {s.state === "start" ? <Loader2 className="size-3 animate-spin" /> : s.state === "error" ? <CircleAlert className="size-3" /> : <Check className="size-3" />}
          <span className="max-w-64 truncate">{s.label}</span>
        </Badge>
      ))}
    </div>
  );
}

function Sources({ sources }: { sources: Source[] }) {
  if (!sources.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      <Globe className="size-3.5 text-muted" />
      {sources.map((s, i) => (
        <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="max-w-56 truncate text-accent underline" title={s.url}>
          [{i + 1}] {s.title}
        </a>
      ))}
    </div>
  );
}

function ProposalCard({ p }: { p: ProfileProposal }) {
  const qc = useQueryClient();
  const apply = useMutation({
    mutationFn: () => api("/api/profile", { method: "PATCH", body: p.patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });
  return (
    <div className="space-y-2 rounded-xl border border-accent/40 bg-accent/5 p-3 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <UserCog className="size-4 text-accent" /> Suggested profile update
      </div>
      <p>{p.summary}</p>
      <ul className="text-xs text-muted">
        {Object.entries(p.patch).map(([k, v]) => (
          <li key={k}>
            <span className="font-mono">{k}</span>: {typeof v === "object" ? JSON.stringify(v) : String(v)}
          </li>
        ))}
      </ul>
      {apply.isSuccess ? (
        <p className="text-accent">Applied to your profile.</p>
      ) : (
        <Button size="sm" variant="primary" loading={apply.isPending} onClick={() => apply.mutate()}>
          Apply to profile
        </Button>
      )}
      {apply.isError && <ErrorBox error={apply.error} />}
    </div>
  );
}
