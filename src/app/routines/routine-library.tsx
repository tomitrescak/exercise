"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Plus } from "lucide-react";
import { api } from "@/lib/client/api";
import type { RoutineListItem } from "@/lib/client/types";
import { useRefineRoutine, useStartRoutine } from "@/lib/client/hooks";
import { Badge, Button, Card, ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { StarToggle } from "@/components/star-toggle";

export function RoutineLibrary() {
  const [showArchived, setShowArchived] = useState(false);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["routines", { showArchived }],
    queryFn: () => api<RoutineListItem[]>(`/api/routines${showArchived ? "?archived=1" : ""}`),
  });
  const start = useStartRoutine();
  const refine = useRefineRoutine();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["routines"] });
  const setStarred = useMutation({
    mutationFn: ({ id, starred }: { id: string; starred: boolean }) => api(`/api/routines/${id}`, { method: "PATCH", body: { starred } }),
    onMutate: async ({ id, starred }) => {
      await qc.cancelQueries({ queryKey: ["routines"] });
      const previous = qc.getQueriesData<RoutineListItem[]>({ queryKey: ["routines"] });
      qc.setQueriesData<RoutineListItem[]>({ queryKey: ["routines"] }, (list) =>
        list?.map((r) => (r.id === id ? { ...r, starred } : r)),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => ctx?.previous.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSettled: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const err = start.error ?? refine.error ?? setStarred.error;
  // Starred first; within each group keep the server's newest-first order.
  const routines = q.data ? [...q.data].sort((a, b) => Number(b.starred) - Number(a.starred)) : [];

  return (
    <div>
      <PageHeader title="Routines" />
      {err && <div className="mb-4"><ErrorBox error={err} /></div>}
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorBox error={q.error} onRetry={() => q.refetch()} />
      ) : routines.length === 0 ? (
        <Card className="text-sm text-muted">No routines yet.</Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {routines.map((r) => (
            <Card key={r.id} className={r.archived ? "opacity-60" : ""}>
              <div className="flex items-start justify-between gap-2">
                <Link href={`/routines/${r.id}`} className="min-w-0 font-semibold break-words hover:underline">
                  {r.name}
                </Link>
                <div className="flex items-center gap-1.5">
                  {r.archived && <Badge>archived</Badge>}
                  <StarToggle starred={r.starred} onToggle={() => setStarred.mutate({ id: r.id, starred: !r.starred })} />
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone="accent">{r.goal}</Badge>
                <Badge>{r.format === "CIRCUIT" ? `circuit × ${r.rounds}` : "straight sets"}</Badge>
                <Badge>~{r.estimatedMinutes} min</Badge>
                <Badge>{r.exerciseCount} exercises</Badge>
                {r.parentName && <Badge tone="warn">from: {r.parentName}</Badge>}
              </div>
              <div className="mt-2 text-xs text-muted">
                {r.lastPerformedAt ? `Last performed ${new Date(r.lastPerformedAt).toLocaleDateString()}` : "Never performed"}
              </div>
              <div className="mt-3">
                <Button size="sm" variant="primary" className="w-full sm:w-auto" loading={start.isPending && start.variables === r.id} onClick={() => start.mutate(r.id)}>
                  <Play className="size-4" /> Start
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="inline-flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
        </label>
        <Button variant="primary" className="w-full sm:w-auto" loading={refine.isPending && refine.variables === null} onClick={() => refine.mutate(null)}>
          <Plus className="size-4" /> New with coach
        </Button>
      </div>
    </div>
  );
}
