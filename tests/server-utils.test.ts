import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createSessionToken, verifySessionToken } from "@/lib/auth";
import { parseIsoDuration, videoProblem } from "@/lib/youtube";
import { toStrictJsonSchema } from "@/lib/agent/tools";
import { trimHistory } from "@/lib/agent/run";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-0123456789";
});

describe("session tokens", () => {
  it("verifies a fresh token", async () => {
    expect(await verifySessionToken(await createSessionToken())).toBe(true);
  });
  it("rejects expired and tampered tokens", async () => {
    const t = await createSessionToken(0);
    expect(await verifySessionToken(t)).toBe(false);
    const fresh = await createSessionToken();
    const [v, exp, sig] = fresh.split(".");
    expect(await verifySessionToken(`${v}.${Number(exp) + 1}.${sig}`)).toBe(false);
    expect(await verifySessionToken(`${fresh}x`)).toBe(false);
  });
});

describe("youtube helpers", () => {
  it("parses ISO-8601 durations", () => {
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("garbage")).toBe(0);
  });
  it("flags private, non-embeddable, too short and too long videos", () => {
    const ok = { durationSec: 120, embeddable: true, isPublic: true };
    expect(videoProblem(ok)).toBeNull();
    expect(videoProblem({ ...ok, isPublic: false })).toMatch(/public/);
    expect(videoProblem({ ...ok, embeddable: false })).toMatch(/embed/);
    expect(videoProblem({ ...ok, durationSec: 15 })).toMatch(/long/);
    expect(videoProblem({ ...ok, durationSec: 1200 })).toMatch(/long/);
  });
});

it("toStrictJsonSchema makes every key required and forbids extra properties (nested too)", () => {
  const s = toStrictJsonSchema(z.object({ a: z.string().nullable(), b: z.array(z.object({ c: z.number() })) })) as { additionalProperties: boolean; required: string[]; properties: { b: { items: { additionalProperties: boolean; required: string[] } } } };
  expect(s.additionalProperties).toBe(false);
  expect(s.required.sort()).toEqual(["a", "b"]);
  expect(s.properties.b.items.additionalProperties).toBe(false);
  expect(s.properties.b.items.required).toEqual(["c"]);
});

it("trimHistory keeps the newest messages within budget but always at least one", () => {
  const msgs = ["aaaa", "bbbb", "cccc"].map((content) => ({ content }));
  expect(trimHistory(msgs, 8).map((m) => m.content)).toEqual(["bbbb", "cccc"]);
  expect(trimHistory([{ content: "x".repeat(100) }], 8)).toHaveLength(1);
});
