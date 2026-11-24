"use client";

import { Star } from "lucide-react";

export function StarToggle({ starred, onToggle }: { starred: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={starred}
      aria-label={starred ? "Unstar routine" : "Star routine"}
      title={starred ? "Unstar" : "Star — keeps it at the top"}
      className="-m-2 shrink-0 rounded p-2 text-muted hover:text-amber-500 focus-visible:outline-2"
    >
      <Star className={`size-5 ${starred ? "fill-amber-400 text-amber-500" : ""}`} />
    </button>
  );
}
