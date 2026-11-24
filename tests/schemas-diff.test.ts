import { describe, expect, it } from "vitest";
import { exercisesMissingVideo, RoutineDraftSchema } from "@/lib/schemas";
import { diffDrafts, isEmptyDiff } from "@/lib/diff";
import { draft, exDraft } from "./fixtures";

describe("RoutineDraftSchema", () => {
  it("accepts reps-only and duration-only exercises", () => {
    expect(RoutineDraftSchema.safeParse(draft({ exercises: [exDraft(), exDraft({ repsMin: null, repsMax: null, durationSec: 30 })] })).success).toBe(true);
  });
  it("rejects both or neither reps and duration", () => {
    expect(RoutineDraftSchema.safeParse(draft({ exercises: [exDraft({ durationSec: 30 })] })).success).toBe(false);
    expect(RoutineDraftSchema.safeParse(draft({ exercises: [exDraft({ repsMin: null, repsMax: null })] })).success).toBe(false);
  });
  it("rejects repsMin > repsMax", () => {
    expect(RoutineDraftSchema.safeParse(draft({ exercises: [exDraft({ repsMin: 15, repsMax: 10 })] })).success).toBe(false);
  });
  it("reports exercises missing videos", () => {
    expect(exercisesMissingVideo(draft({ exercises: [exDraft(), exDraft({ youtubeVideoId: null })] }))).toEqual([1]);
  });
});

describe("diffDrafts", () => {
  it("is empty for identical drafts", () => {
    expect(isEmptyDiff(diffDrafts(draft(), draft()))).toBe(true);
  });
  it("detects added, removed, changed (case-insensitive match) and moved", () => {
    const base = draft({ exercises: [exDraft({ name: "Push-up" }), exDraft({ name: "Row" }), exDraft({ name: "Curl" })] });
    const next = draft({
      rounds: 3,
      exercises: [exDraft({ name: "row" }), exDraft({ name: "Push-up", repsMax: 20 }), exDraft({ name: "Dead bug" })],
    });
    const d = diffDrafts(base, next);
    expect(d.routine).toEqual([{ field: "rounds", from: 2, to: 3 }]);
    expect(d.added.map((e) => e.name)).toEqual(["Dead bug"]);
    expect(d.removed.map((e) => e.name)).toEqual(["Curl"]);
    expect(d.changed).toEqual([{ name: "Push-up", changes: [{ field: "repsMax", from: 15, to: 20 }] }]);
    expect(d.moved.sort()).toEqual(["Push-up", "row"]);
  });
});
