import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:opacity-90",
  secondary: "border border-border bg-surface hover:bg-surface-2",
  ghost: "hover:bg-surface-2",
  danger: "border border-danger/40 text-danger hover:bg-danger/10",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean }) {
  const sizes = { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-sm", lg: "h-14 px-6 text-base" };
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg [&_svg]:shrink-0 font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-xl border border-border bg-surface p-4", className)}>{children}</div>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "warn" | "danger" }) {
  const tones = {
    neutral: "bg-surface-2 text-muted",
    accent: "bg-accent/15 text-accent",
    warn: "bg-warn/15 text-warn",
    danger: "bg-danger/15 text-danger",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-muted">
      <Loader2 className="size-5 animate-spin" /> {label ?? "Loading…"}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
      <span>{msg}</span>
      {onRetry && (
        <Button size="sm" variant="danger" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-base outline-none sm:text-sm focus:border-accent focus:ring-2 focus:ring-accent/30";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(inputClass, className)} {...rest} />;
}
export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputClass, className)} {...rest} />;
}
export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(inputClass, className)} {...rest} />;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {error ? <span className="block text-xs text-danger">{error}</span> : hint ? <span className="block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight break-words sm:text-2xl">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex w-full flex-wrap gap-2 sm:w-auto">{actions}</div>}
    </div>
  );
}

export { cx };
