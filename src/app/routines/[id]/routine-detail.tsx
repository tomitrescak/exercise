"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Copy, MessageSquare, Play } from "lucide-react";
import { api } from "@/lib/client/api";
import type { RoutineDetail } from "@/lib/client/types";
import { useRefineRoutine, useStartRoutine } from "@/lib/client/hooks";
import { formatDuration } from "@/lib/workout";
import { Badge, Button, Card, ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { ExerciseCard } from "@/components/exercise-card";
import { StarToggle } from "@/components/star-toggle";
import { Markdown } from "@/components/markdown";

export function RoutineDetailView() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["routine", id], queryFn: () => api<RoutineDetail>(`/api/routines/${id}`) });
  const start = useStartRoutine();
  const refine = useRefineRoutine();
  const duplicate = useMutation({
    mutationFn: () => api<{ id: string }>(`/api/routines/${id}/duplicate`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["routines"] }),
  });
  const setArchived = useMutation({
    mutationFn: (archived: boolean) => api(`/api/routines/${id}`, { method: "PATCH", body: { archived } }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["routine", id] });
      qc.invalidateQueries({ queryKey: ["routines"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  const setStarred = useMutation({
    mutationFn: (starred: boolean) => api(`/api/routines/${id}`, { method: "PATCH", body: { starred } }),
    onMutate: (starred) => qc.setQueryData<RoutineDetail>(["routine", id], (r) => (r ? { ...r, starred } : r)),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["routine", id] });
      qc.invalidateQueries({ queryKey: ["routines"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  if (q.isPending) return <Spinner />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const r = q.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-start gap-2">
            <span className="min-w-0 break-words">{r.name}</span>
            <StarToggle starred={r.starred} onToggle={() => setStarred.mutate(!r.starred)} />
          </span>
        }
        subtitle={
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="accent">{r.goal}</Badge>
            <Badge>{r.format === "CIRCUIT" ? `circuit × ${r.rounds} rounds · ${r.restBetweenRoundsSec}s between rounds` : "straight sets"}</Badge>
            <Badge>~{r.estimatedMinutes} min</Badge>
            {r.archived && <Badge>archived</Badge>}
            {r.parent && (
              <Badge tone="warn">
                from: <Link href={`/routines/${r.parent.id}`} className="underline">{r.parent.name}</Link>
              </Badge>
            )}
          </div>
        }
        actions={
          <>
            <Button variant="primary" className="flex-1 sm:flex-none" loading={start.isPending} onClick={() => start.mutate(r.id)}>
              <Play className="size-4" /> Start
            </Button>
            <Button className="flex-1 sm:flex-none" loading={refine.isPending} onClick={() => refine.mutate(r.id)}>
              <MessageSquare className="size-4" /> Refine<span className="hidden sm:inline"> with coach</span>
            </Button>
            <Button variant="ghost" aria-label="Duplicate" title="Duplicate" loading={duplicate.isPending} onClick={() => duplicate.mutate()}>
              <Copy className="size-4" /> <span className="hidden sm:inline">Duplicate</span>
            </Button>
            <Button
              variant="ghost"
              aria-label={r.archived ? "Restore" : "Archive"}
              title={r.archived ? "Restore" : "Archive"}
              loading={setArchived.isPending}
              onClick={() => setArchived.mutate(!r.archived)}
            >
              {r.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
              <span className="hidden sm:inline">{r.archived ? "Restore" : "Archive"}</span>
            </Button>
          </>
        }
      />
      {(start.error || refine.error || duplicate.error || setArchived.error) && (
        <ErrorBox error={start.error ?? refine.error ?? duplicate.error ?? setArchived.error} />
      )}
      {duplicate.data && (
        <Card className="text-sm">
          Copied. <Link className="text-accent underline" href={`/routines/${duplicate.data.id}`}>Open the copy</Link>
        </Card>
      )}

      {r.description && <p className="text-sm">{r.description}</p>}
      {r.rating && (
        <Card>
          <div className="text-sm font-semibold">
            Coach rating: {r.rating.overall}/10 overall · {r.rating.balance}/10 balance
          </div>
          <p className="mt-1 text-sm text-muted">{r.rating.summary}</p>
        </Card>
      )}

      <div className="space-y-3">
        {r.exercises.map((ex, i) => (
          <ExerciseCard key={ex.id} ex={ex} index={i} />
        ))}
      </div>

      {r.coachNotes && (
        <Card>
          <h2 className="mb-2 font-semibold">Coach notes</h2>
          <Markdown text={r.coachNotes} />
        </Card>
      )}

      <Card>
        <h2 className="mb-2 font-semibold">History for this routine</h2>
        {r.sessions.length === 0 ? (
          <p className="text-sm text-muted">Not performed yet.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {r.sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-x-3 py-1.5">
                <span>{new Date(s.startedAt).toLocaleString()}</span>
                <span className="text-muted">
                  {s.status === "IN_PROGRESS" ? (
                    <Link className="text-accent underline" href={`/workout/${s.id}`}>in progress</Link>
                  ) : (
                    <>
                      {s.status.toLowerCase()} · {s.activeDurationSec != null ? formatDuration(s.activeDurationSec) : "–"}
                      {s.perceivedExertion != null && ` · RPE ${s.perceivedExertion}`}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
