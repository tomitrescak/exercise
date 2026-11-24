"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, History, Pencil, Save, Trash2, TriangleAlert, X } from "lucide-react";
import { api, errorText } from "@/lib/client/api";
import type { ConversationView } from "@/lib/client/types";
import { diffDrafts, isEmptyDiff, type DraftDiff } from "@/lib/diff";
import { RoutineDraftSchema, type RoutineDraft } from "@/lib/schemas";
import { Badge, Button, Card, ErrorBox, Field, Input, Select } from "@/components/ui";
import { ExerciseCard } from "@/components/exercise-card";
import { Markdown } from "@/components/markdown";

export function DraftPanel({ conv, busy }: { conv: ConversationView; busy: boolean }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["conversation", conv.id] });

  const revert = useMutation({
    mutationFn: (version: number) => api(`/api/conversations/${conv.id}/draft/revert`, { body: { version } }),
    onSuccess: refresh,
  });

  const diff = useMemo(() => (conv.original && conv.draft ? diffDrafts(conv.original, conv.draft) : null), [conv.original, conv.draft]);

  if (!conv.draft) {
    return (
      <Card className="flex h-full min-h-60 items-center justify-center text-center text-sm text-muted">
        The draft routine will appear here as soon as the coach creates it.
      </Card>
    );
  }
  const d = conv.draft;
  const missing = conv.missingVideo;

  return (
    <div className="space-y-3">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{d.name}</h2>
              <Badge>v{conv.draftVersion}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge tone="accent">{d.goal}</Badge>
              <Badge>{d.format === "CIRCUIT" ? `circuit × ${d.rounds}` : "straight sets"}</Badge>
              <Badge>~{d.estimatedMinutes} min</Badge>
              <Badge>{d.exercises.length} exercises</Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {conv.versions.length > 1 && (
              <label className="flex items-center gap-1 text-sm">
                <History className="size-4 text-muted" />
                <Select
                  className="h-9 w-auto py-0"
                  value=""
                  disabled={busy || revert.isPending}
                  onChange={(e) => e.target.value && revert.mutate(Number(e.target.value))}
                  aria-label="Restore a previous version"
                >
                  <option value="">Undo to…</option>
                  {conv.versions
                    .filter((v) => v.version !== conv.draftVersion)
                    .reverse()
                    .map((v) => (
                      <option key={v.version} value={v.version}>
                        v{v.version} · {v.source} · {new Date(v.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </option>
                    ))}
                </Select>
              </label>
            )}
            {!editing && (
              <Button size="sm" disabled={busy} onClick={() => setEditing(true)}>
                <Pencil className="size-4" /> Edit
              </Button>
            )}
            <Button size="sm" variant="primary" disabled={busy || missing.length > 0 || editing} onClick={() => setSaving(true)}>
              <Save className="size-4" /> Save as new routine
            </Button>
          </div>
        </div>
        {d.description && <p className="text-sm text-muted">{d.description}</p>}
        {missing.length > 0 && (
          <p className="flex gap-2 rounded-lg bg-warn/10 p-2 text-sm text-warn">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            Can’t save yet — missing verified video for: {missing.map((i) => d.exercises[i].name).join(", ")}. Ask the coach to find one.
          </p>
        )}
        {revert.isError && <ErrorBox error={revert.error} />}
        {conv.savedRoutines.length > 0 && (
          <p className="text-sm text-muted">
            Saved from this conversation:{" "}
            {conv.savedRoutines.map((r, i) => (
              <span key={r.id}>
                {i > 0 && ", "}
                <Link className="text-accent underline" href={`/routines/${r.id}`}>{r.name}</Link>
              </span>
            ))}
          </p>
        )}
        {d.rating && (
          <p className="text-sm">
            <span className="font-medium">Rating:</span> {d.rating.overall}/10 overall · {d.rating.balance}/10 balance — {d.rating.summary}
          </p>
        )}
      </Card>

      {saving && <SaveDialog conv={conv} onClose={() => setSaving(false)} />}
      {diff && !isEmptyDiff(diff) && <DiffView diff={diff} />}

      {editing ? (
        <DraftEditor key={conv.draftVersion} conv={conv} draft={d} onDone={() => setEditing(false)} />
      ) : (
        <div className="space-y-3">
          {d.exercises.map((ex, i) => (
            <ExerciseCard key={`${conv.draftVersion}-${i}`} ex={ex} index={i} />
          ))}
          {d.coachNotes && (
            <Card>
              <h3 className="mb-1 font-semibold">Coach notes</h3>
              <Markdown text={d.coachNotes} />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "–" : String(v));

function DiffView({ diff }: { diff: DraftDiff }) {
  return (
    <Card className="space-y-1 text-sm">
      <h3 className="font-semibold">Changes vs original</h3>
      {diff.routine.map((c) => (
        <p key={c.field}>
          <span className="text-muted">{c.field}:</span> {fmt(c.from)} → <span className="font-medium">{fmt(c.to)}</span>
        </p>
      ))}
      {diff.added.map((e) => (
        <p key={`a-${e.name}`} className="text-accent">+ {e.name}</p>
      ))}
      {diff.removed.map((e) => (
        <p key={`r-${e.name}`} className="text-danger line-through">− {e.name}</p>
      ))}
      {diff.changed.map((c) => (
        <p key={`c-${c.name}`}>
          <span className="text-warn">~ {c.name}:</span>{" "}
          {c.changes.map((ch) => `${ch.field} ${fmt(ch.from)} → ${fmt(ch.to)}`).join(", ")}
        </p>
      ))}
      {diff.moved.length > 0 && <p className="text-muted">Reordered: {diff.moved.join(", ")}</p>}
    </Card>
  );
}

function SaveDialog({ conv, onClose }: { conv: ConversationView; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(conv.draft?.name ?? "");
  const suggest = useMutation({
    mutationFn: () => api<{ name: string }>(`/api/conversations/${conv.id}/suggest-name`, { method: "POST" }),
    onSuccess: (r) => setName(r.name),
  });
  const save = useMutation({
    mutationFn: () => api<{ id: string; name: string }>(`/api/conversations/${conv.id}/save`, { body: { name } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversation", conv.id] });
      qc.invalidateQueries({ queryKey: ["routines"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  return (
    <Card className="space-y-3 border-accent/50">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Save as new routine</h3>
        <button onClick={onClose} aria-label="Close"><X className="size-4" /></button>
      </div>
      {save.isSuccess ? (
        <div className="space-y-2 text-sm">
          <p>
            Saved <Link className="text-accent underline" href={`/routines/${save.data.id}`}>{save.data.name}</Link>. You can keep refining here and save again.
          </p>
          <Button size="sm" onClick={onClose}>Close</Button>
        </div>
      ) : (
        <>
          <Field label="Name">
            <div className="flex gap-2">
              <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
              <Button type="button" size="md" loading={suggest.isPending} onClick={() => suggest.mutate()}>
                Suggest
              </Button>
            </div>
          </Field>
          <p className="text-xs text-muted">Every video is re-verified before saving.{conv.routine && ` Lineage: from “${conv.routine.name}”.`}</p>
          {save.isError && <ErrorBox error={errorText(save.error)} />}
          <Button variant="primary" loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      )}
    </Card>
  );
}

const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

function DraftEditor({ conv, draft, onDone }: { conv: ConversationView; draft: RoutineDraft; onDone: () => void }) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (d: RoutineDraft) => api(`/api/conversations/${conv.id}/draft`, { method: "PATCH", body: { draft: d } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["conversation", conv.id] });
      onDone();
    },
  });

  const form = useForm({
    defaultValues: draft,
    validators: {
      onSubmit: ({ value }) => {
        const r = RoutineDraftSchema.safeParse(value);
        return r.success ? undefined : r.error.issues.map((i) => i.message).join("; ");
      },
    },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(RoutineDraftSchema.parse(value));
    },
  });

  const numField = (
    i: number,
    name: "sets" | "repsMin" | "repsMax" | "durationSec" | "restSec" | "loadKg",
    label: string,
    required = false,
  ) => (
    <form.Field name={`exercises[${i}].${name}`}>
      {(f) => (
        <Field label={label}>
          <Input
            type="number"
            step="any"
            className="h-9"
            value={f.state.value ?? ""}
            onChange={(e) => f.handleChange((required ? Number(e.target.value || 0) : numOrNull(e.target.value)) as never)}
          />
        </Field>
      )}
    </form.Field>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="space-y-3"
    >
      <Card className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <form.Field name="format">
          {(f) => (
            <Field label="Format">
              <Select className="h-9 py-0" value={f.state.value} onChange={(e) => f.handleChange(e.target.value as RoutineDraft["format"])}>
                <option value="CIRCUIT">Circuit</option>
                <option value="STRAIGHT_SETS">Straight sets</option>
              </Select>
            </Field>
          )}
        </form.Field>
        {(["rounds", "restBetweenRoundsSec", "estimatedMinutes"] as const).map((n) => (
          <form.Field key={n} name={n}>
            {(f) => (
              <Field label={{ rounds: "Rounds", restBetweenRoundsSec: "Rest between rounds (s)", estimatedMinutes: "Est. minutes" }[n]}>
                <Input type="number" className="h-9" value={f.state.value} onChange={(e) => f.handleChange(Number(e.target.value || 0))} />
              </Field>
            )}
          </form.Field>
        ))}
      </Card>

      <form.Field name="exercises" mode="array">
        {(arr) => (
          <div className="space-y-2">
            {arr.state.value.map((ex, i) => (
              <Card key={`${ex.name}-${i}`} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {i + 1}. {ex.name}
                  </span>
                  <div className="flex gap-1">
                    <Button type="button" size="sm" variant="ghost" disabled={i === 0} onClick={() => arr.moveValue(i, i - 1)} aria-label="Move up">
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={i === arr.state.value.length - 1}
                      onClick={() => arr.moveValue(i, i + 1)}
                      aria-label="Move down"
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={arr.state.value.length <= 1}
                      onClick={() => arr.removeValue(i)}
                      aria-label="Delete exercise"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {numField(i, "sets", "Sets", true)}
                  {numField(i, "repsMin", "Reps min")}
                  {numField(i, "repsMax", "Reps max")}
                  {numField(i, "durationSec", "Time (s)")}
                  {numField(i, "restSec", "Rest (s)", true)}
                  {numField(i, "loadKg", "Load (kg)")}
                </div>
              </Card>
            ))}
          </div>
        )}
      </form.Field>

      <form.Subscribe selector={(s) => s.errors}>{(errors) => (errors.length ? <ErrorBox error={errors.join("; ")} /> : null)}</form.Subscribe>
      {save.isError && <ErrorBox error={errorText(save.error)} />}
      <div className="flex gap-2">
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(submitting) => (
            <Button type="submit" variant="primary" loading={submitting}>
              Save edits as v{conv.draftVersion + 1}
            </Button>
          )}
        </form.Subscribe>
        <Button type="button" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
