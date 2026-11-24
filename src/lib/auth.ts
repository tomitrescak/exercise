export const SESSION_COOKIE = "coach_session";
export const SESSION_MAX_AGE_SEC = 30 * 24 * 60 * 60;

const encoder = new TextEncoder();

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET must be set (at least 16 characters)");
  }
  return secret;
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Buffer.from(sig).toString("base64url");
}

/** Constant-time string comparison (length leak only). */
export function safeEqual(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

export async function createSessionToken(nowMs = Date.now()): Promise<string> {
  const exp = Math.floor(nowMs / 1000) + SESSION_MAX_AGE_SEC;
  const payload = `v1.${exp}`;
  return `${payload}.${await hmac(payload)}`;
}

export async function verifySessionToken(
  token: string | undefined | null,
  nowMs = Date.now(),
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp * 1000 < nowMs) return false;
  const expected = await hmac(`${parts[0]}.${parts[1]}`);
  return safeEqual(expected, parts[2]);
}

export function checkPassword(candidate: string): boolean {
  const password = process.env.APP_PASSWORD;
  if (!password) throw new Error("APP_PASSWORD must be set");
  return safeEqual(candidate, password);
}

// In-memory, per-process login rate limit: 5 attempts per minute per client.
const attempts = new Map<string, number[]>();

export function allowLoginAttempt(clientKey: string, nowMs = Date.now()): boolean {
  const windowStart = nowMs - 60_000;
  const recent = (attempts.get(clientKey) ?? []).filter((t) => t > windowStart);
  if (recent.length >= 5) {
    attempts.set(clientKey, recent);
    return false;
  }
  recent.push(nowMs);
  attempts.set(clientKey, recent);
  return true;
}
