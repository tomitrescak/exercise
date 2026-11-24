import { describe, expect, it } from "vitest";
import { activeSeconds, advanceCursor, buildSteps, formatDuration, initialCursor, skipExerciseSteps } from "@/lib/workout";
import { snapEx } from "./fixtures";

describe("buildSteps", () => {
  it("expands a circuit into rounds with round rest and no rest after the final step", () => {
    const steps = buildSteps({
      format: "CIRCUIT",
      rounds: 2,
      restBetweenRoundsSec: 90,
      exercises: [snapEx({ id: "a", restSec: 20 }), snapEx({ id: "b", restSec: 30 })],
    });
    expect(steps.map((s) => [s.round, s.exerciseIndex, s.restAfterSec])).toEqual([
      [1, 0, 20],
      [1, 1, 90],
      [2, 0, 20],
      [2, 1, 0],
    ]);
    expect(steps.filter((s) => s.endsRound)).toHaveLength(2);
  });

  it("does left then right with no rest in between for per-side exercises", () => {
    const steps = buildSteps({ format: "STRAIGHT_SETS", rounds: 5, restBetweenRoundsSec: 0, exercises: [snapEx({ sets: 2, perSide: true, restSec: 40 })] });
    expect(steps.map((s) => `${s.setIndex}${s.side}:${s.restAfterSec}`)).toEqual(["1left:0", "1right:40", "2left:0", "2right:0"]);
  });
});

describe("activeSeconds", () => {
  const start = new Date("2025-01-01T10:00:00Z");
  it("subtracts accumulated pauses", () => {
    expect(activeSeconds({ startedAt: start, pausedTotalSec: 60 }, start.getTime() + 300_000)).toBe(240);
  });
  it("freezes while paused", () => {
    const pausedAt = new Date(start.getTime() + 100_000);
    expect(activeSeconds({ startedAt: start, pausedAt, pausedTotalSec: 0 }, start.getTime() + 999_000)).toBe(100);
  });
});

describe("advanceCursor / skipExerciseSteps", () => {
  const steps = buildSteps({ format: "CIRCUIT", rounds: 1, restBetweenRoundsSec: 0, exercises: [snapEx({ sets: 2, restSec: 30 }), snapEx({ restSec: 0 })] });

  it("enters rest with an end mark in active seconds", () => {
    expect(advanceCursor(steps, initialCursor(), 50)).toEqual({ stepIndex: 1, phase: "rest", phaseStartedActiveSec: 50, restEndsActiveSec: 80 });
  });
  it("finishes after the last step", () => {
    expect(advanceCursor(steps, { ...initialCursor(), stepIndex: 2 }, 99).phase).toBe("done");
  });
  it("skips only the remaining sets of the current exercise", () => {
    expect(skipExerciseSteps(steps, initialCursor())).toHaveLength(2);
  });
});

it("formatDuration", () => {
  expect(formatDuration(65)).toBe("1:05");
  expect(formatDuration(3725)).toBe("1:02:05");
});
