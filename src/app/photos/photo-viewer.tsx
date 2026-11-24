"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, Trash2, X } from "lucide-react";
import type { PhotoItem } from "@/lib/client/types";
import { formatPhotoDate, photoUrl } from "@/lib/client/photos";
import { cx } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";

const SPEEDS = [2, 3, 5, 8];

/** Full-screen photo viewer; with `autoplay` it runs as a looping slideshow. */
export function PhotoViewer({
  photos,
  startIndex,
  autoplay,
  onClose,
  onDelete,
}: {
  photos: PhotoItem[];
  startIndex: number;
  autoplay: boolean;
  onClose: () => void;
  onDelete?: (photo: PhotoItem) => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [playing, setPlaying] = useState(autoplay);
  const [speed, setSpeed] = useState(3);
  const swipe = useRef<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const closeConfirm = useCallback(() => setConfirmDelete(false), []);

  const count = photos.length;
  const i = Math.min(index, count - 1);
  const photo = photos[i];
  const go = useCallback((delta: number) => setIndex((n) => (Math.min(n, count - 1) + delta + count) % count), [count]);

  useEffect(() => {
    if (count === 0) onClose();
  }, [count, onClose]);

  useEffect(() => {
    if (!playing || count < 2) return;
    const t = setTimeout(() => go(1), speed * 1000);
    return () => clearTimeout(t);
  }, [playing, speed, i, count, go]);

  // Warm the cache for the next photo so slides switch instantly.
  useEffect(() => {
    if (count < 2) return;
    new Image().src = photoUrl(photos[(i + 1) % count].id, "full");
  }, [i, count, photos]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [go, onClose]);

  if (!photo) return null;
  const iconBtn = "rounded-full p-2.5 text-white/90 hover:bg-white/15 disabled:opacity-40";

  return (
    <div role="dialog" aria-modal aria-label="Photo viewer" className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center gap-3 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{formatPhotoDate(photo.takenOn, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</div>
          {photo.caption && <div className="truncate text-sm text-white/70">{photo.caption}</div>}
        </div>
        <span className="text-sm text-white/60 tabular-nums">
          {i + 1} / {count}
        </span>
        <button className={iconBtn} onClick={onClose} aria-label="Close">
          <X className="size-5" />
        </button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center select-none"
        onPointerDown={(e) => (swipe.current = e.clientX)}
        onPointerUp={(e) => {
          if (swipe.current == null) return;
          const dx = e.clientX - swipe.current;
          swipe.current = null;
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- served from our own immutable-cached API */}
        <img
          key={photo.id}
          src={photoUrl(photo.id, "full")}
          alt={photo.caption ?? `Photo from ${photo.takenOn}`}
          width={photo.width}
          height={photo.height}
          draggable={false}
          className="photo-fade-in max-h-full max-w-full object-contain"
        />
      </div>

      <div className="flex items-center justify-center gap-2 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button className={iconBtn} onClick={() => go(-1)} disabled={count < 2} aria-label="Previous photo">
          <ChevronLeft className="size-6" />
        </button>
        <button
          className={cx(iconBtn, "bg-white/10")}
          onClick={() => setPlaying((p) => !p)}
          disabled={count < 2}
          aria-label={playing ? "Pause slideshow" : "Play slideshow"}
        >
          {playing ? <Pause className="size-6" /> : <Play className="size-6" />}
        </button>
        <button className={iconBtn} onClick={() => go(1)} disabled={count < 2} aria-label="Next photo">
          <ChevronRight className="size-6" />
        </button>
        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          aria-label="Seconds per photo"
          className="ml-2 h-9 rounded-md border border-white/20 bg-black px-2 text-sm text-white"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}s
            </option>
          ))}
        </select>
        {onDelete && (
          <button
            className={cx(iconBtn, "ml-2 text-red-300")}
            aria-label="Delete photo"
            onClick={() => {
              setPlaying(false);
              setConfirmDelete(true);
            }}
          >
            <Trash2 className="size-5" />
          </button>
        )}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this photo?"
        message={`The photo from ${formatPhotoDate(photo.takenOn)} will be removed permanently.`}
        confirmLabel="Delete photo"
        onCancel={closeConfirm}
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete?.(photo);
        }}
      />
    </div>
  );
}