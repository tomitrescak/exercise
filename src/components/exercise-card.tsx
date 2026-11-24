"use client";

import { AlertTriangle } from "lucide-react";
import type { ExerciseDraft } from "@/lib/schemas";
import { prescription } from "@/lib/workout";
import { Badge } from "@/components/ui";
import { VideoEmbed } from "@/components/video-embed";

export function ExerciseCard({ ex, index, children }: { ex: ExerciseDraft; index: number; children?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-surface p-4 md:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold">{index + 1}</span>
          <h3 className="min-w-0 font-semibold break-words">{ex.name}</h3>
          <Badge>{ex.movementPattern.replace("_", " ")}</Badge>
        </div>
        <p className="text-sm">
          <span className="font-medium">
            {ex.sets} × {prescription(ex)}
          </span>
          <span className="text-muted">
            {" "}
            · rest {ex.restSec}s{ex.targetRir != null && ` · RIR ${ex.targetRir}`}
            {ex.tempo && ` · tempo ${ex.tempo}`}
          </span>
        </p>
        {ex.equipment && <p className="text-xs text-muted">Equipment: {ex.equipment}</p>}
        {ex.primaryMuscles.length > 0 && <p className="text-xs text-muted">Muscles: {ex.primaryMuscles.join(", ")}</p>}
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
        {children}
      </div>
      <VideoEmbed videoId={ex.youtubeVideoId} title={ex.youtubeTitle} channel={ex.youtubeChannel} />
    </div>
  );
}
