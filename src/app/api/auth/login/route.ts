import { z } from "zod";
import { NextResponse } from "next/server";
import { allowLoginAttempt, checkPassword, createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SEC } from "@/lib/auth";
import { handler, HttpError, parseBody } from "@/lib/http";

export const POST = handler(
  async (request) => {
    const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (!allowLoginAttempt(client)) throw new HttpError(429, "Too many attempts; wait a minute");
    const { password } = await parseBody(request, z.object({ password: z.string().min(1).max(200) }));
    if (!checkPassword(password)) throw new HttpError(401, "Wrong password");
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, await createSessionToken(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SEC,
    });
    return res;
  },
  { auth: false },
);
