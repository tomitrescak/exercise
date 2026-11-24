"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { api } from "@/lib/client/api";
import type { DashboardData } from "@/lib/client/types";
import { Button, Card, ErrorBox, PageHeader, Textarea } from "@/components/ui";

const SUGGESTIONS = [
  "Build me a 30-minute whole-body routine to build muscle with my kettlebell and barbell.",
  "Rate my routine: 3 rounds of KB overhead rotations, swings, halos, 30 wide push-ups, 10 close push-ups, 20 sit-ups, 12 leg raises, single-leg crunches, 24 kg barbell curls.",
  "I want a bigger chest — design a chest-priority full-body routine.",
  "Give me a 15-minute mobility routine with no floor work.",
];

export function CoachStart() {
  const router = useRouter();
  const [text, setText] = useState("");
  const convs = useQuery({ queryKey: ["dashboard"], queryFn: () => api<DashboardData>("/api/dashboard") });
  const start = useMutation({
    mutationFn: () => api<{ id: string }>("/api/conversations", { body: { routineId: null } }),
    onSuccess: ({ id }) => router.push(`/coach/${id}?send=${encodeURIComponent(text.trim())}`),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Coach" subtitle="Describe what you want. The coach researches, picks verified technique videos, and builds a draft you can refine and save." />
      <Card className="space-y-3">
        <Textarea
          rows={4}
          autoFocus
          placeholder="e.g. 30-min whole-body, 12 kg KB and 24 kg barbell, build muscle"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) start.mutate();
          }}
        />
        <div className="flex justify-end">
          <Button variant="primary" disabled={!text.trim()} loading={start.isPending} onClick={() => start.mutate()}>
            <Send className="size-4" /> Start
          </Button>
        </div>
        {start.isError && <ErrorBox error={start.error} />}
      </Card>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => setText(s)} className="rounded-lg border border-border bg-surface p-3 text-left text-sm hover:bg-surface-2">
            {s}
          </button>
        ))}
      </div>
      {convs.data && convs.data.conversations.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">Recent conversations</h2>
          <ul className="space-y-1 text-sm">
            {convs.data.conversations.map((c) => (
              <li key={c.id} className="flex justify-between">
                <Link href={`/coach/${c.id}`} className="hover:underline">{c.title ?? "Untitled"}</Link>
                <span className="text-muted">{new Date(c.updatedAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
