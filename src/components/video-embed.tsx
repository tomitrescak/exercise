"use client";

import { useState } from "react";
import { Play, VideoOff } from "lucide-react";

/** Lightweight YouTube embed: thumbnail until clicked, then a youtube-nocookie iframe. */
export function VideoEmbed({ videoId, title, channel }: { videoId: string | null; title?: string | null; channel?: string | null }) {
  const [playing, setPlaying] = useState(false);
  if (!videoId) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-warn/60 bg-warn/10 text-sm text-warn">
        <VideoOff className="size-5" /> Video missing — ask the coach to find one
      </div>
    );
  }
  return (
    <figure className="space-y-1">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
        {playing ? (
          <iframe
            className="absolute inset-0 size-full"
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
            title={title ?? "Exercise video"}
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button type="button" onClick={() => setPlaying(true)} className="group absolute inset-0" aria-label={`Play ${title ?? "video"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt="" loading="lazy" className="size-full object-cover opacity-90" />
            <span className="absolute inset-0 m-auto flex size-14 items-center justify-center rounded-full bg-black/70 text-white transition group-hover:scale-110">
              <Play className="size-6 fill-white" />
            </span>
          </button>
        )}
      </div>
      {(title || channel) && (
        <figcaption className="truncate text-xs text-muted">
          {title} {channel && <>· {channel}</>}
        </figcaption>
      )}
    </figure>
  );
}
