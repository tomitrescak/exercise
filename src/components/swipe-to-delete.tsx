"use client";

import { useRef, useState, type ReactNode } from "react";
import { Loader2, Trash2 } from "lucide-react";

const ACTION_WIDTH = 88;

/**
 * Swipe left to reveal a Delete button (iOS-style). Deleting needs a deliberate tap on the
 * revealed button, so a stray swipe never destroys data. Vertical scrolling is unaffected.
 */
export function SwipeToDelete({
  open,
  onOpenChange,
  onDelete,
  deleting,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
  deleting?: boolean;
  children: ReactNode;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number; base: number; horizontal: boolean | null } | null>(null);
  const moved = useRef(false);
  // Pointer events can outrun re-renders, so pointerup reads the latest offset from a ref.
  const dragRef = useRef<number | null>(null);
  const setOffset = (v: number | null) => {
    dragRef.current = v;
    setDrag(v);
  };

  const offset = drag ?? (open ? -ACTION_WIDTH : 0);

  return (
    <div className="relative overflow-hidden">
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        className="absolute inset-y-0 right-0 flex items-center justify-center gap-1.5 bg-danger text-sm font-medium text-white"
        style={{ width: ACTION_WIDTH }}
      >
        {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Delete
      </button>
      <div
        className="relative touch-pan-y bg-surface"
        style={{ transform: `translateX(${offset}px)`, transition: drag == null ? "transform 200ms ease" : "none" }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          start.current = { x: e.clientX, y: e.clientY, base: open ? -ACTION_WIDTH : 0, horizontal: null };
          moved.current = false;
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if (s.horizontal == null) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            s.horizontal = Math.abs(dx) > Math.abs(dy);
            if (s.horizontal) e.currentTarget.setPointerCapture(e.pointerId);
          }
          if (!s.horizontal) return;
          moved.current = true;
          // Rubber-band past the action width; no swiping right beyond closed.
          const raw = s.base + dx;
          setOffset(raw < -ACTION_WIDTH ? -ACTION_WIDTH + (raw + ACTION_WIDTH) / 3 : Math.min(0, raw));
        }}
        onPointerUp={() => {
          const last = dragRef.current;
          if (start.current?.horizontal && last != null) onOpenChange(last < -ACTION_WIDTH / 2);
          start.current = null;
          setOffset(null);
        }}
        onPointerCancel={() => {
          start.current = null;
          setOffset(null);
        }}
        onClickCapture={(e) => {
          // A swipe shouldn't also follow the link underneath; a tap on an open row just closes it.
          if (moved.current || open) {
            e.preventDefault();
            e.stopPropagation();
            if (!moved.current) onOpenChange(false);
          }
          moved.current = false;
        }}
      >
        {children}
      </div>
    </div>
  );
}
