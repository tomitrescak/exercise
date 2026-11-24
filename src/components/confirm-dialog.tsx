"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * Full-screen confirmation, replacing window.confirm(). Rendered in a portal so transformed
 * ancestors (e.g. swipe rows) can't clip it. Escape or Cancel dismisses; Cancel gets initial
 * focus so an accidental Enter never triggers the destructive action.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = true,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    // Capture phase so an underlying viewer's Escape handler doesn't also close.
    window.addEventListener("keydown", onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
    };
  }, [open, onCancel]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="alertdialog"
      aria-modal
      aria-labelledby="confirm-title"
      className="photo-fade-in fixed inset-0 z-[60] flex flex-col bg-background text-foreground sm:items-center sm:justify-center sm:bg-black/60 sm:backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="flex flex-1 flex-col px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:w-full sm:max-w-md sm:flex-none sm:rounded-2xl sm:border sm:border-border sm:bg-surface sm:p-6 sm:shadow-xl">
        <div className="flex flex-1 flex-col items-center justify-center text-center sm:flex-none">
          {destructive && (
            <div className="mb-5 flex size-16 items-center justify-center rounded-full bg-danger/10 text-danger">
              <AlertTriangle className="size-8" />
            </div>
          )}
          <h2 id="confirm-title" className="text-2xl font-semibold sm:text-xl">
            {title}
          </h2>
          {message && <div className="mt-2 max-w-sm text-base text-muted sm:text-sm">{message}</div>}
        </div>
        <div className="mt-8 grid grid-cols-1 gap-3 sm:mt-6 sm:grid-cols-2">
          <Button
            size="lg"
            variant={destructive ? "danger" : "primary"}
            className={destructive ? "order-first border-danger! bg-danger! text-white! sm:order-last" : "order-first sm:order-last"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
          <Button autoFocus size="lg" onClick={onCancel}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
