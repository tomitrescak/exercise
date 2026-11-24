"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ChevronUp, Minus, Pause, Play, Plus, SkipForward, Square, Timer } from "lucide-react";
import { api, ApiError, errorText } from "@/lib/client/api";
import { beep, unlockAudio, vibrate } from "@/lib/client/feedback";
import type { Cursor, SessionView, SetLog } from "@/lib/client/types";
import {
  activeSeconds,
  advanceCursor,
  buildSteps,
  formatDuration,
  prescription,
  skipExerciseSteps,
  targetReps,
  type Step,
} from "@/lib/workout";
import { Button, Card, ErrorBox, Spinner, Textarea } from "@/components/ui";
import { VideoEmbed } from "@/components/video-embed";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function WorkoutPlayer() {
  const { id } = useParams<{ id: string }>();
  // Always load fresh state so a reload resumes exactly where the server left off.
  const q = useQuery({ queryKey: ["session", id], queryFn: () => api<SessionView>(`/api/sessions/${id}`), staleTime: 0, gcTime: 0 });
  if (q.isPending) return <Spinner label="Loading workout…" />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  return <Player initial={q.data} />;
}

function useNow(active: boolean, offsetMs: number) {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now() + offsetMs), 250);
    return () => clearInterval(t);
  }, [active, offsetMs]);
  return now;
}

function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        if (document.visibilityState === "visible") lock = await navigator.wakeLock.request("screen");
      } catch {
        /* not allowed (e.g. battery saver) */
      }
    };
    void acquire();
    const onVis = () => void acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release();
    };
  }, [enabled]);
}

function Player({ initial }: { initial: SessionView }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [session, setSession] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<(() => Promise<void>) | null>(null);
  const [showVideo, setShowVideo] = useState(true);
  const [ending, setEnding] = useState(false);

  // Server clock offset keeps timers correct even if the device clock is off.
  const [offsetMs] = useState(() => (initial.serverNow ? new Date(initial.serverNow).getTime() - Date.now() : 0));
  const inProgress = session.status === "IN_PROGRESS";
  const now = useNow(inProgress, offsetMs);
  useWakeLock(inProgress && !session.pausedAt);

  const snap = session.routineSnapshot;
  const steps = useMemo(() => buildSteps(snap), [snap]);
  const cursor = session.cursor;
  const active = activeSeconds(session, now);
  const step: Step | undefined = steps[cursor.stepIndex];
  const ex = step ? snap.exercises[step.exerciseIndex] : undefined;
  const paused = !!session.pausedAt;

  /** Runs a server mutation, applying the returned session; errors are retryable. */
  const run = useCallback(
    async (fn: () => Promise<SessionView>) => {
      const attempt = async () => {
        setPending(true);
        setError(null);
        try {
          const next = await fn();
          setSession((s) => ({ ...s, ...next }));
          setLastAction(null);
        } catch (err) {
          // 409 = the session already ended elsewhere (another tab/device). Retrying can't succeed,
          // so adopt the server's state, which lands on the finished/abandoned summary.
          if (err instanceof ApiError && err.status === 409) {
            try {
              const fresh = await api<SessionView>(`/api/sessions/${initial.id}`);
              setSession((s) => ({ ...s, ...fresh }));
              setLastAction(null);
              return;
            } catch {
              /* fall through to the normal error */
            }
          }
          setError(errorText(err));
          setLastAction(() => attempt);
        } finally {
          setPending(false);
        }
      };
      await attempt();
    },
    [initial.id],
  );

  const post = (path: string, body?: unknown) => api<SessionView>(`/api/sessions/${session.id}${path}`, { method: "POST", body: body ?? {} });
  const patchCursor = (c: Cursor) => api<SessionView>(`/api/sessions/${session.id}`, { method: "PATCH", body: { cursor: c } });

  // ----- rest phase -----
  const restRemaining = cursor.phase === "rest" && cursor.restEndsActiveSec != null ? cursor.restEndsActiveSec - active : 0;
  const restEndHandled = useRef<number | null>(null);
  useEffect(() => {
    if (cursor.phase !== "rest" || paused || pending || restRemaining > 0) return;
    if (restEndHandled.current === cursor.stepIndex) return;
    restEndHandled.current = cursor.stepIndex;
    beep(400, 660);
    vibrate([200, 100, 200]);
    const next: Cursor = { ...cursor, phase: "work", phaseStartedActiveSec: cursor.restEndsActiveSec ?? active, restEndsActiveSec: null };
    void run(() => patchCursor(next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, paused, pending, restRemaining]);

  // ----- work phase: reps / load / timed countdown -----
  const lastLogFor = (exerciseId: string): SetLog | undefined =>
    [...session.sets].reverse().find((s) => s.exerciseId === exerciseId && !s.skipped);
  const defaultReps = ex ? (lastLogFor(ex.id)?.actualReps ?? targetReps(ex) ?? 0) : 0;
  const [reps, setReps] = useState(defaultReps);
  const [load, setLoad] = useState<string>(ex?.loadKg?.toString() ?? "");
  const loadStep = /barbell/i.test(ex?.equipment ?? "") ? 2.5 : 1;
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const stepKey = `${cursor.stepIndex}-${cursor.phase}`;
  const [seenStepKey, setSeenStepKey] = useState(stepKey);
  if (seenStepKey !== stepKey) {
    // Reset per-set inputs when the cursor moves (render-time state adjustment).
    setSeenStepKey(stepKey);
    setReps(defaultReps);
    setLoad(ex?.loadKg?.toString() ?? lastLogFor(ex?.id ?? "")?.loadKg?.toString() ?? "");
    setTimerStart(null);
  }

  const timed = ex?.durationSec != null;
  const timerRemaining = timed && timerStart != null ? ex!.durationSec! - (active - timerStart) : null;
  const lastBeepSec = useRef<number | null>(null);
  useEffect(() => {
    if (timerRemaining == null || paused) return;
    const sec = Math.ceil(timerRemaining);
    if (sec === lastBeepSec.current) return;
    lastBeepSec.current = sec;
    if (sec <= 3 && sec >= 1) beep(120, 880);
    if (sec === 0) {
      beep(500, 990);
      vibrate(400);
    }
  }, [timerRemaining, paused]);

  const completeStep = (skipped: boolean) => {
    if (!step || !ex) return;
    unlockAudio();
    const durationSec = Math.max(0, Math.round(active - cursor.phaseStartedActiveSec));
    const next = advanceCursor(steps, cursor, active);
    void run(() =>
      post("/sets", {
        exerciseId: ex.id,
        exerciseName: ex.name,
        round: step.round,
        setIndex: step.setIndex,
        side: step.side,
        targetReps: targetReps(ex),
        actualReps: skipped ? null : timed ? null : reps,
        loadKg: skipped || load.trim() === "" ? null : Number(load),
        durationSec: skipped ? null : durationSec,
        skipped,
        cursor: next,
      }),
    );
  };

  const skipExercise = () => {
    if (!ex) return;
    const toSkip = skipExerciseSteps(steps, cursor);
    const lastIdx = cursor.stepIndex + toSkip.length - 1;
    const next = advanceCursor(steps, { ...cursor, stepIndex: lastIdx }, active);
    void run(async () => {
      let res: SessionView | null = null;
      for (const s of toSkip) {
        res = await post("/sets", {
          exerciseId: ex.id,
          exerciseName: ex.name,
          round: s.round,
          setIndex: s.setIndex,
          side: s.side,
          targetReps: targetReps(ex),
          actualReps: null,
          loadKg: null,
          durationSec: null,
          skipped: true,
          cursor: next,
        });
      }
      return res!;
    });
  };

  const togglePause = () => {
    unlockAudio();
    void run(() => (paused ? post("/resume") : post("/pause", { cursor })));
  };

  const finish = (body: { perceivedExertion: number | null; notes: string | null }) =>
    run(async () => {
      const r = await post("/finish", body);
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["history"] });
      return r;
    });

  const abandon = () =>
    run(async () => {
      const r = await post("/abandon");
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      return r;
    });

  // ----- render -----
  const totalRounds = snap.format === "CIRCUIT" ? snap.rounds : 1;
  const progress = steps.length ? Math.min(1, cursor.stepIndex / steps.length) : 0;
  const errorBar = error && (
    <ErrorBox error={error} onRetry={lastAction ? () => void lastAction() : undefined} />
  );

  if (!inProgress || cursor.phase === "done" || ending) {
    return (
      <Summary
        session={session}
        steps={steps}
        active={active}
        pending={pending}
        error={errorBar}
        onFinish={finish}
        onAbandon={abandon}
        onBack={inProgress && cursor.phase !== "done" ? () => setEnding(false) : undefined}
        onDone={() => router.push("/history")}
      />
    );
  }

  const nextStep = steps[cursor.stepIndex];
  const nextEx = nextStep ? snap.exercises[nextStep.exerciseIndex] : undefined;

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 -mx-4 space-y-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm text-muted">{snap.name}</div>
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-3xl font-semibold tabular-nums">{formatDuration(active)}</span>
              {step && (
                <span className="text-sm text-muted">
                  Round {step.round} / {totalRounds}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="lg" onClick={togglePause} disabled={pending} aria-label={paused ? "Resume" : "Pause"} className="w-14 px-0!">
              {paused ? <Play className="size-5" /> : <Pause className="size-5" />}
            </Button>
            <Button size="lg" variant="danger" onClick={() => setEnding(true)} disabled={pending} aria-label="End workout" className="w-14 px-0!">
              <Square className="size-5" />
            </Button>
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-accent transition-all" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      {errorBar}
      {paused && <Card className="border-warn/50 bg-warn/10 text-center font-medium text-warn">Paused — timers are frozen</Card>}

      {cursor.phase === "rest" ? (
        <Card className="space-y-4 text-center">
          <div className="flex items-center justify-center gap-2 text-sm text-muted">
            <Timer className="size-4" /> Rest
          </div>
          <div className="font-mono text-7xl font-semibold tabular-nums">{formatDuration(Math.max(0, Math.ceil(restRemaining)))}</div>
          <div className="grid grid-cols-2 gap-3">
            <Button
              size="lg"
              disabled={pending}
              onClick={() => void run(() => patchCursor({ ...cursor, restEndsActiveSec: (cursor.restEndsActiveSec ?? active) + 15 }))}
            >
              +15 s
            </Button>
            <Button
              size="lg"
              variant="primary"
              disabled={pending}
              onClick={() => {
                unlockAudio();
                restEndHandled.current = cursor.stepIndex;
                void run(() => patchCursor({ ...cursor, phase: "work", phaseStartedActiveSec: active, restEndsActiveSec: null }));
              }}
            >
              <SkipForward className="size-5" /> Skip rest
            </Button>
          </div>
          {nextEx && nextStep && (
            <div className="rounded-lg bg-surface-2 p-3 text-left">
              <div className="text-xs text-muted uppercase">Up next</div>
              <div className="font-semibold">
                {nextEx.name}
                {nextStep.side && ` · ${nextStep.side}`}
              </div>
              <div className="text-sm text-muted">
                Set {nextStep.setIndex}/{nextEx.sets} · {prescription(nextEx)}
              </div>
            </div>
          )}
        </Card>
      ) : (
        ex &&
        step && (
          <Card className="space-y-4">
            <div>
              <div className="text-xs text-muted uppercase">
                Exercise {step.exerciseIndex + 1}/{snap.exercises.length} · Set {step.setIndex}/{ex.sets}
                {step.side && ` · ${step.side} side`}
              </div>
              <h2 className="text-2xl font-semibold">{ex.name}</h2>
              <p className="text-lg">
                {prescription(ex)}
                {ex.targetRir != null && <span className="text-muted"> · RIR {ex.targetRir}</span>}
                {ex.tempo && <span className="text-muted"> · tempo {ex.tempo}</span>}
              </p>
            </div>

            <button className="flex items-center gap-1 text-sm text-accent" onClick={() => setShowVideo((v) => !v)}>
              {showVideo ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />} {showVideo ? "Hide video" : "Show technique video"}
            </button>
            {showVideo && <VideoEmbed key={ex.id} videoId={ex.youtubeVideoId} title={ex.youtubeTitle} channel={ex.youtubeChannel} />}

            {ex.cues.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-sm">
                {ex.cues.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            )}
            {ex.safetyNotes && (
              <p className="flex gap-2 rounded-lg bg-warn/10 p-2 text-sm text-warn">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {ex.safetyNotes}
              </p>
            )}

            {timed ? (
              <div className="space-y-3 text-center">
                <div className="font-mono text-7xl font-semibold tabular-nums">
                  {formatDuration(Math.max(0, Math.ceil(timerRemaining ?? ex.durationSec!)))}
                </div>
                {timerStart == null && (
                  <Button
                    size="lg"
                    className="w-full"
                    disabled={paused}
                    onClick={() => {
                      unlockAudio();
                      setTimerStart(active);
                    }}
                  >
                    <Play className="size-5" /> Start timer
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <Button size="lg" className="size-20 rounded-full px-0!" onClick={() => setReps((r) => Math.max(0, r - 1))} aria-label="One less rep">
                  <Minus className="size-8" />
                </Button>
                <div className="text-center">
                  <div className="font-mono text-7xl font-semibold tabular-nums">{reps}</div>
                  <div className="text-xs text-muted">reps{step.side && ` (${step.side})`}</div>
                </div>
                <Button size="lg" className="size-20 rounded-full px-0!" onClick={() => setReps((r) => r + 1)} aria-label="One more rep">
                  <Plus className="size-8" />
                </Button>
              </div>
            )}

            <div className="flex items-center justify-between gap-4">
              <Button size="lg" className="size-20 rounded-full px-0!" disabled={load.trim() === ""} onClick={() => setLoad((l) => adjustLoad(l, -loadStep))} aria-label={`${loadStep} kg less`}>
                <Minus className="size-8" />
              </Button>
              <label className="min-w-0 flex-1 text-center">
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0}
                  className="w-full bg-transparent text-center font-mono text-7xl font-semibold tabular-nums outline-none placeholder:text-muted [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  value={load}
                  placeholder="—"
                  onChange={(e) => setLoad(e.target.value)}
                  aria-label="Load in kg"
                />
                <span className="block text-xs text-muted">kg</span>
              </label>
              <Button size="lg" className="size-20 rounded-full px-0!" onClick={() => setLoad((l) => adjustLoad(l, loadStep))} aria-label={`${loadStep} kg more`}>
                <Plus className="size-8" />
              </Button>
            </div>

            <Button size="lg" variant="primary" className="h-16 w-full text-lg" loading={pending} disabled={paused} onClick={() => completeStep(false)}>
              Set done
            </Button>
            <Button variant="ghost" className="w-full" disabled={pending || paused} onClick={skipExercise}>
              <SkipForward className="size-4" /> Skip exercise
            </Button>
          </Card>
        )
      )}
    </div>
  );
}

function Summary({
  session,
  steps,
  active,
  pending,
  error,
  onFinish,
  onAbandon,
  onBack,
  onDone,
}: {
  session: SessionView;
  steps: Step[];
  active: number;
  pending: boolean;
  error: React.ReactNode;
  onFinish: (b: { perceivedExertion: number | null; notes: string | null }) => Promise<void>;
  onAbandon: () => Promise<void>;
  onBack?: () => void;
  onDone: () => void;
}) {
  const [rpe, setRpe] = useState<number | null>(session.perceivedExertion);
  const [notes, setNotes] = useState(session.notes ?? "");
  const done = session.status !== "IN_PROGRESS";
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const closeAbandon = useCallback(() => setConfirmAbandon(false), []);
  const completed = session.sets.filter((s) => !s.skipped);
  const totalReps = completed.reduce((n, s) => n + (s.actualReps ?? 0), 0);
  const skippedNames = [...new Set(session.sets.filter((s) => s.skipped).map((s) => s.exerciseName))];
  const duration = done ? (session.activeDurationSec ?? 0) : active;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold">{done ? (session.status === "COMPLETED" ? "Workout saved 💪" : "Workout abandoned") : "Finish workout"}</h1>
      {error}
      <Card className="grid grid-cols-2 gap-4 text-center">
        <Stat label="Active time" value={formatDuration(duration)} />
        <Stat label="Sets" value={`${completed.length} / ${steps.length}`} />
        <Stat label="Total reps" value={String(totalReps)} />
        <Stat label="Skipped" value={String(skippedNames.length)} />
      </Card>
      {skippedNames.length > 0 && <p className="text-sm text-muted">Skipped: {skippedNames.join(", ")}</p>}

      {done ? (
        <div className="flex gap-2">
          <Button variant="primary" onClick={onDone}>View history</Button>
          <Link href={`/routines/${session.routineId}`}>
            <Button>Back to routine</Button>
          </Link>
        </div>
      ) : (
        <Card className="space-y-4">
          <div>
            <div className="mb-2 text-sm font-medium">How hard was it? (RPE 1–10)</div>
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <Button key={n} size="lg" variant={rpe === n ? "primary" : "secondary"} onClick={() => setRpe(rpe === n ? null : n)}>
                  {n}
                </Button>
              ))}
            </div>
          </div>
          <Textarea rows={3} placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <Button size="lg" variant="primary" className="w-full" loading={pending} onClick={() => void onFinish({ perceivedExertion: rpe, notes: notes.trim() || null })}>
            Save workout
          </Button>
          <div className="flex justify-between">
            {onBack ? (
              <Button variant="ghost" onClick={onBack}>
                Back to workout
              </Button>
            ) : (
              <span />
            )}
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => setConfirmAbandon(true)}
            >
              Abandon
            </Button>
          </div>
          <ConfirmDialog
            open={confirmAbandon}
            title="Abandon this workout?"
            message="It will be saved to your history as abandoned, together with the sets you've logged so far."
            confirmLabel="Abandon workout"
            cancelLabel="Keep going"
            onCancel={closeAbandon}
            onConfirm={() => {
              setConfirmAbandon(false);
              void onAbandon();
            }}
          />
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

/** Steps a load string by `delta` kg; never below 0, and an empty load starts at the first step. */
function adjustLoad(load: string, delta: number): string {
  const current = Number(load);
  if (load.trim() === "" || !Number.isFinite(current)) return delta > 0 ? String(delta) : load;
  return String(Math.max(0, Math.round((current + delta) * 100) / 100));
}
