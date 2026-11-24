"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MessageSquarePlus, Play, Star, Timer } from "lucide-react";
import { api } from "@/lib/client/api";
import type { DashboardData } from "@/lib/client/types";
import { useStartRoutine } from "@/lib/client/hooks";
import { Button, Card, ErrorBox, PageHeader, Spinner } from "@/components/ui";

export function Dashboard() {
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api<DashboardData>("/api/dashboard") });
  const start = useStartRoutine();

  if (q.isPending) return <Spinner />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Today"
        actions={
          <Link href="/coach">
            <Button variant="primary">
              <MessageSquarePlus className="size-4" /> New routine with coach
            </Button>
          </Link>
        }
      />

      {d.inProgress && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-accent/50 bg-accent/10">
          <div>
            <div className="font-semibold">Workout in progress</div>
            <div className="text-sm text-muted">
              {d.inProgress.routineName} · started {new Date(d.inProgress.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
          <Link href={`/workout/${d.inProgress.id}`}>
            <Button variant="primary">
              <Play className="size-4" /> Resume
            </Button>
          </Link>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <div className="flex items-center gap-2 text-sm text-muted">
            <Timer className="size-4" /> This week
          </div>
          <div className="mt-2 text-3xl font-semibold">{d.thisWeek.minutes} min</div>
          <div className="text-sm text-muted">{d.thisWeek.sessions} session(s) completed</div>
        </Card>
        <Card>
          <div className="text-sm text-muted">Recent coach conversations</div>
          <ul className="mt-2 space-y-1 text-sm">
            {d.conversations.length === 0 && <li className="text-muted">None yet</li>}
            {d.conversations.map((c) => (
              <li key={c.id}>
                <Link className="hover:underline" href={`/coach/${c.id}`}>
                  {c.title ?? "Untitled conversation"}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <section>
        <h2 className="mb-3 font-semibold">Quick start</h2>
        {d.quickStart.length === 0 ? (
          <Card className="text-sm text-muted">
            No routines yet. <Link href="/coach" className="text-accent underline">Create one with the coach</Link>.
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {d.quickStart.map((r) => (
              <Card key={r.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/routines/${r.id}`} className="flex items-center gap-1.5 font-medium hover:underline">
                    {r.starred && <Star className="size-4 shrink-0 fill-amber-400 text-amber-500" aria-label="Starred" />}
                    <span className="truncate">{r.name}</span>
                  </Link>
                  <div className="text-xs text-muted">
                    ~{r.estimatedMinutes} min
                    {r.lastPerformedAt && ` · last done ${new Date(r.lastPerformedAt).toLocaleDateString()}`}
                  </div>
                </div>
                <Button variant="primary" size="sm" loading={start.isPending && start.variables === r.id} onClick={() => start.mutate(r.id)}>
                  <Play className="size-4" /> Start
                </Button>
              </Card>
            ))}
          </div>
        )}
        {start.isError && <div className="mt-3"><ErrorBox error={start.error} /></div>}
      </section>
    </div>
  );
}
