import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { handler } from "@/lib/http";

export const POST = handler(
  async () => {
    const res = NextResponse.json({ ok: true });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  },
  { auth: false },
);
