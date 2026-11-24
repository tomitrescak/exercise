import { NextResponse, type NextRequest } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { z, type ZodType } from "zod";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function requireAuth(request: NextRequest): Promise<void> {
  const ok = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!ok) throw new HttpError(401, "Unauthorized");
}

export async function parseBody<T>(request: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new HttpError(400, "Validation failed", z.flattenError(result.error as z.ZodError));
  }
  return result.data;
}

type Ctx<P> = { params: Promise<P> };

/** Wraps a route handler with auth + uniform error responses. */
export function handler<P = Record<string, never>>(
  fn: (request: NextRequest, params: P) => Promise<Response>,
  opts: { auth?: boolean } = {},
) {
  return async (request: NextRequest, ctx: Ctx<P>): Promise<Response> => {
    try {
      if (opts.auth !== false) await requireAuth(request);
      const params = ctx?.params ? await ctx.params : ({} as P);
      return await fn(request, params);
    } catch (err) {
      // Let Next.js internals (e.g. the dynamic-rendering bailout) propagate instead of becoming 500s.
      unstable_rethrow(err);
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message, details: err.details }, { status: err.status });
      }
      console.error(err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function notFound(what = "Not found"): never {
  throw new HttpError(404, what);
}
