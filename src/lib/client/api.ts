export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: init.signal,
  });
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth")) {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload outside React on expired session
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText, data.details);
  return data as T;
}

export function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    const d = err.details;
    if (Array.isArray(d) && d.length) return `${err.message}: ${d.join(", ")}`;
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}
