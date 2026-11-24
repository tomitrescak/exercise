"use client";

let ctx: AudioContext | null = null;

/** Must be called from a user gesture once so later beeps are allowed. */
export function unlockAudio() {
  if (typeof window === "undefined") return;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
}

export function beep(durationMs = 150, frequency = 880) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.25, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + durationMs / 1000);
}

export function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
}
