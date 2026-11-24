"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { api } from "@/lib/client/api";
import type { HistoryData, RoutineListItem } from "@/lib/client/types";
import { formatDuration } from "@/lib/workout";
import { Button, Card, cx, ErrorBox, PageHeader, Select, Spinner } from "@/components/ui";
import { SwipeToDelete } from "@/components/swipe-to-delete";
import { ConfirmDialog } from "@/components/confirm-dialog";

type Sort = "date_desc" | "date_asc" | "duration_desc" | "duration_asc";
const PAGE_SIZE = 15;

export function HistoryView() {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<Sort>("date_desc");
  const [routineId, setRoutineId] = useState("");

  const routines = useQuery({ queryKey: ["routines", { showArchived: true }], queryFn: () => api<RoutineListItem[]>("/api/routines?archived=1") });
  const q = useQuery({
    queryKey: ["history", { page, sort, routineId }],
    queryFn: () => {
      const p = new URLSearchParams({ weeks: "12", page: String(page), pageSize: String(PAGE_SIZE), sort });
      if (routineId) p.set("routineId", routineId);
      return api<HistoryData>(`/api/history?${p}`);
    },
    placeholderData: keepPreviousData,
  });

  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const closeConfirm = useCallback(() => setConfirmDeleteId(null), []);
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setOpenId(null);
      qc.invalidateQueries({ queryKey: ["history"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["routine"] });
      qc.invalidateQueries({ queryKey: ["routines"] });
    },
  });

  const toggleSort = (col: "date" | "duration") => {
    setPage(1);
    setSort((s) => (s === `${col}_desc` ? `${col}_asc` : `${col}_desc`));
  };
  const sortIcon = (col: "date" | "duration") =>
    sort === `${col}_desc` ? <ArrowDown className="size-3" /> : sort === `${col}_asc` ? <ArrowUp className="size-3" /> : null;

  if (q.isPending) return <Spinner />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const pages = Math.max(1, Math.ceil(d.total / d.pageSize));
  const maxMinutes = Math.max(1, ...d.weekly.map((w) => w.minutes));

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={confirmDeleteId != null}
        title="Delete this workout?"
        message="It will be removed from your history, together with its logged sets. This can't be undone."
        confirmLabel="Delete workout"
        onCancel={closeConfirm}
        onConfirm={() => {
          if (confirmDeleteId) remove.mutate(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
      />
      <PageHeader title="History" subtitle={`${d.total} recorded workout(s)`} />

      <Card>
        <h2 className="mb-3 font-semibold">Minutes per week (last 12 weeks)</h2>
        <div className="flex h-40 items-end gap-1 sm:gap-1.5">
          {d.weekly.map((w, i) => (
            <div key={w.weekStart} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${w.sessions} session(s), ${w.minutes} min`}>
              <span className="text-[10px] text-muted">{w.minutes || ""}</span>
              <div className="w-full rounded-t bg-accent/80" style={{ height: `${(w.minutes / maxMinutes) * 100}%`, minHeight: w.minutes ? 4 : 1 }} />
              <span className={`text-[10px] whitespace-nowrap text-muted ${(d.weekly.length - 1 - i) % 2 ? "invisible sm:visible" : ""}`}>
                {new Date(w.weekStart).toLocaleDateString([], { month: "numeric", day: "numeric" })}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Workouts</h2>
          <Select
            className="w-full sm:w-auto sm:max-w-xs"
            value={routineId}
            onChange={(e) => {
              setRoutineId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All routines</option>
            {routines.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </div>
        {remove.isError && <ErrorBox error={remove.error} />}
        {d.sessions.length > 0 && <p className="text-xs text-muted sm:hidden">Swipe a workout left to delete it.</p>}
        <ul className={cx("-mx-4 divide-y divide-border/60 border-y border-border/60 sm:hidden", q.isFetching && "opacity-60")}>
          {d.sessions.length === 0 && <li className="py-6 text-center text-sm text-muted">No workouts recorded yet.</li>}
          {d.sessions.map((s) => (
            <li key={s.id} className="text-sm">
              <SwipeToDelete
                open={openId === s.id}
                onOpenChange={(o) => setOpenId(o ? s.id : null)}
                onDelete={() => remove.mutate(s.id)}
                deleting={remove.isPending && remove.variables === s.id}
              >
                <div className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <Link className="min-w-0 truncate font-medium hover:underline" href={`/routines/${s.routineId}`}>{s.routineName}</Link>
                    <span className="shrink-0 tabular-nums">{s.activeDurationSec != null ? formatDuration(s.activeDurationSec) : "–"}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted">
                    <span>{new Date(s.startedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
                    <span>· {s.setsCompleted}/{s.plannedSets} sets</span>
                    {s.perceivedExertion != null && <span>· RPE {s.perceivedExertion}</span>}
                    <span>· {s.status.toLowerCase()}</span>
                  </div>
                </div>
              </SwipeToDelete>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto sm:block">
          <table className={cx("w-full text-sm", q.isFetching && "opacity-60")}>
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-2 pr-3">
                  <button className="inline-flex items-center gap-1" onClick={() => toggleSort("date")}>Date {sortIcon("date")}</button>
                </th>
                <th className="py-2 pr-3">Routine</th>
                <th className="py-2 pr-3">
                  <button className="inline-flex items-center gap-1" onClick={() => toggleSort("duration")}>Active time {sortIcon("duration")}</button>
                </th>
                <th className="py-2 pr-3">Sets</th>
                <th className="py-2 pr-3">RPE</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {d.sessions.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted">No workouts recorded yet.</td>
                </tr>
              )}
              {d.sessions.map((s) => (
                <tr key={s.id} className="border-b border-border/60">
                  <td className="py-2 pr-3 whitespace-nowrap">{new Date(s.startedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td className="py-2 pr-3">
                    <Link className="hover:underline" href={`/routines/${s.routineId}`}>{s.routineName}</Link>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{s.activeDurationSec != null ? formatDuration(s.activeDurationSec) : "–"}</td>
                  <td className="py-2 pr-3 tabular-nums">{s.setsCompleted} / {s.plannedSets}</td>
                  <td className="py-2 pr-3">{s.perceivedExertion ?? "–"}</td>
                  <td className="py-2 pr-3 text-muted">{s.status.toLowerCase()}</td>
                  <td className="py-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="px-2! text-muted hover:text-danger"
                      aria-label="Delete workout"
                      title="Delete workout"
                      loading={remove.isPending && remove.variables === s.id}
                      onClick={() => setConfirmDeleteId(s.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-2 text-sm sm:justify-end">
          <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-muted">Page {d.page} / {pages}</span>
          <Button size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Per-exercise trend (last 12 weeks)</h2>
        {d.exerciseTrends.length === 0 ? (
          <p className="text-sm text-muted">Complete a workout to see trends.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {d.exerciseTrends.map((t) => (
              <TrendChart key={t.exerciseName} trend={t} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function TrendChart({ trend }: { trend: HistoryData["exerciseTrends"][number] }) {
  const pts = trend.points;
  const maxReps = Math.max(1, ...pts.map((p) => p.maxReps ?? 0));
  const W = 300;
  const H = 80;
  const x = (i: number) => (pts.length === 1 ? W / 2 : (i / (pts.length - 1)) * (W - 20) + 10);
  const y = (v: number) => H - 10 - (v / maxReps) * (H - 20);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.maxReps ?? 0)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{trend.exerciseName}</span>
        <span className="text-muted">
          best {last.maxReps ?? "–"} reps{last.maxLoadKg != null && ` @ ${last.maxLoadKg} kg`}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-20 w-full text-accent">
        <path d={path} fill="none" stroke="currentColor" strokeWidth={2} />
        {pts.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.maxReps ?? 0)} r={3} fill="currentColor">
            <title>{`${new Date(p.date).toLocaleDateString()}: ${p.maxReps ?? "–"} reps${p.maxLoadKg != null ? ` @ ${p.maxLoadKg} kg` : ""}`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}
