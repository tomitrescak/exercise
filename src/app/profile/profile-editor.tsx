"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { api, errorText } from "@/lib/client/api";
import { ProfileSchema, type Profile } from "@/lib/schemas";
import { Button, Card, ErrorBox, Field, Input, PageHeader, Select, Spinner, Textarea } from "@/components/ui";

type FormValues = Omit<Profile, "benchmarks" | "equipment"> & {
  equipment: { name: string; loadsKg: string; maxKg: string; adjustable: boolean }[];
  benchmarks: { key: string; value: string }[];
};

const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

function toForm(p: Profile): FormValues {
  return {
    ...p,
    equipment: p.equipment.map((e) => ({
      name: e.name,
      loadsKg: e.loadsKg.join(", "),
      maxKg: e.maxKg?.toString() ?? "",
      adjustable: e.adjustable,
    })),
    benchmarks: Object.entries(p.benchmarks ?? {}).map(([key, value]) => ({ key, value: String(value) })),
  };
}

function fromForm(v: FormValues): unknown {
  return {
    ...v,
    displayName: v.displayName?.trim() || null,
    sex: v.sex?.trim() || null,
    focusNotes: v.focusNotes?.trim() || null,
    healthConstraints: v.healthConstraints?.trim() || null,
    equipment: v.equipment
      .filter((e) => e.name.trim())
      .map((e) => ({
        name: e.name.trim(),
        loadsKg: e.loadsKg
          .split(/[,\s]+/)
          .filter(Boolean)
          .map(Number),
        maxKg: numOrNull(e.maxKg),
        adjustable: e.adjustable,
      })),
    benchmarks: v.benchmarks.some((b) => b.key.trim())
      ? Object.fromEntries(
          v.benchmarks
            .filter((b) => b.key.trim())
            .map((b) => [b.key.trim(), Number.isFinite(Number(b.value)) && b.value.trim() !== "" ? Number(b.value) : b.value]),
        )
      : null,
  };
}

export function ProfileEditor() {
  const q = useQuery({ queryKey: ["profile"], queryFn: () => api<Profile & { updatedAt: string | null }>("/api/profile") });
  if (q.isPending) return <Spinner />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const { updatedAt, ...profile } = q.data;
  return <ProfileForm key={updatedAt ?? "new"} initial={profile} />;
}

function ProfileForm({ initial }: { initial: Profile }) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (p: Profile) => api<Profile>("/api/profile", { method: "PUT", body: p }),
    onSuccess: (data) => qc.setQueryData(["profile"], data),
  });

  const form = useForm({
    defaultValues: toForm(initial),
    validators: {
      onSubmit: ({ value }) => {
        const r = ProfileSchema.safeParse(fromForm(value));
        if (r.success) return undefined;
        return r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      },
    },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(ProfileSchema.parse(fromForm(value)));
    },
  });

  const num = (name: "ageYears" | "weightKg" | "heightCm" | "sessionMaxMinutes" | "sessionsPerWeek", label: string, hint?: string) => (
    <form.Field name={name}>
      {(field) => (
        <Field label={label} hint={hint}>
          <Input
            type="number"
            inputMode="decimal"
            step="any"
            value={field.state.value ?? ""}
            onBlur={field.handleBlur}
            onChange={(e) => field.handleChange((numOrNull(e.target.value) ?? (name.startsWith("session") ? 0 : null)) as never)}
          />
        </Field>
      )}
    </form.Field>
  );

  const text = (name: "displayName" | "sex" | "primaryGoal", label: string, hint?: string) => (
    <form.Field name={name}>
      {(field) => (
        <Field label={label} hint={hint}>
          <Input value={field.state.value ?? ""} onBlur={field.handleBlur} onChange={(e) => field.handleChange(e.target.value)} />
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
      className="space-y-6"
    >
      <PageHeader
        title="Profile"
        subtitle="The coach reads this on every turn."
        actions={
          <form.Subscribe selector={(s) => [s.isSubmitting, s.isDirty] as const}>
            {([submitting, dirty]) => (
              <Button type="submit" variant="primary" loading={submitting} disabled={!dirty && !save.isError}>
                Save profile
              </Button>
            )}
          </form.Subscribe>
        }
      />

      <form.Subscribe selector={(s) => s.errors}>
        {(errors) => (errors.length ? <ErrorBox error={errors.join("; ")} /> : null)}
      </form.Subscribe>
      {save.isError && <ErrorBox error={errorText(save.error)} />}
      {save.isSuccess && <p className="text-sm text-accent">Saved.</p>}

      <Card className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {text("displayName", "Name")}
        {num("ageYears", "Age")}
        {text("sex", "Sex")}
        {num("weightKg", "Weight (kg)")}
        {num("heightCm", "Height (cm)")}
        <form.Field name="experienceLevel">
          {(field) => (
            <Field label="Experience">
              <Select value={field.state.value} onChange={(e) => field.handleChange(e.target.value as Profile["experienceLevel"])}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </Select>
            </Field>
          )}
        </form.Field>
      </Card>

      <Card className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {text("primaryGoal", "Primary goal", "e.g. hypertrophy, strength, general_health, mobility")}
        {num("sessionMaxMinutes", "Max minutes per session")}
        {num("sessionsPerWeek", "Sessions per week")}
        <div className="sm:col-span-3">
          <form.Field name="focusNotes">
            {(field) => (
              <Field label="Focus notes" hint='e.g. "large chest priority"'>
                <Input value={field.state.value ?? ""} onChange={(e) => field.handleChange(e.target.value)} />
              </Field>
            )}
          </form.Field>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Health constraints</h2>
        <form.Field name="healthConstraints">
          {(field) => (
            <Field
              label="Medical history, injuries, limitations"
              hint="Treated as hard constraints by the coach. Stored locally; sent to OpenAI only as part of the coach prompt."
            >
              <Textarea rows={5} value={field.state.value ?? ""} onChange={(e) => field.handleChange(e.target.value)} />
            </Field>
          )}
        </form.Field>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Equipment</h2>
        <form.Field name="equipment" mode="array">
          {(field) => (
            <div className="space-y-3">
              {field.state.value.map((_, i) => (
                <div key={i} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[2fr_2fr_1fr_auto_auto]">
                  <form.Field name={`equipment[${i}].name`}>
                    {(f) => (
                      <Field label="Name">
                        <Input value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
                      </Field>
                    )}
                  </form.Field>
                  <form.Field name={`equipment[${i}].loadsKg`}>
                    {(f) => (
                      <Field label="Fixed loads (kg)">
                        <Input placeholder="12, 16" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
                      </Field>
                    )}
                  </form.Field>
                  <form.Field name={`equipment[${i}].maxKg`}>
                    {(f) => (
                      <Field label="Max kg">
                        <Input type="number" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
                      </Field>
                    )}
                  </form.Field>
                  <form.Field name={`equipment[${i}].adjustable`}>
                    {(f) => (
                      <label className="flex h-10 items-center gap-2 text-sm">
                        <input type="checkbox" checked={f.state.value} onChange={(e) => f.handleChange(e.target.checked)} /> Adjustable
                      </label>
                    )}
                  </form.Field>
                  <Button type="button" variant="ghost" aria-label="Remove equipment" onClick={() => field.removeValue(i)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" size="sm" onClick={() => field.pushValue({ name: "", loadsKg: "", maxKg: "", adjustable: false })}>
                <Plus className="size-4" /> Add equipment
              </Button>
            </div>
          )}
        </form.Field>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Benchmarks</h2>
        <form.Field name="benchmarks" mode="array">
          {(field) => (
            <div className="space-y-2">
              {field.state.value.map((_, i) => (
                <div key={i} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[2fr_1fr_auto]">
                  <form.Field name={`benchmarks[${i}].key`}>
                    {(f) => (
                      <Field label="Benchmark">
                        <Input placeholder="pushUpMax" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
                      </Field>
                    )}
                  </form.Field>
                  <form.Field name={`benchmarks[${i}].value`}>
                    {(f) => (
                      <Field label="Value">
                        <Input value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
                      </Field>
                    )}
                  </form.Field>
                  <Button type="button" variant="ghost" aria-label="Remove benchmark" onClick={() => field.removeValue(i)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" size="sm" onClick={() => field.pushValue({ key: "", value: "" })}>
                <Plus className="size-4" /> Add benchmark
              </Button>
            </div>
          )}
        </form.Field>
      </Card>
    </form>
  );
}
