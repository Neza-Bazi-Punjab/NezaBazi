"use client";

import { useEffect, useState } from "react";
import type { ScoringRun } from "@/lib/scoring/types";
import { poolName } from "./format";
import ResultBadge from "./ResultBadge";
import "./scoring.css";

export const RESULT_FLASH_MS = 4_000;

const flashKey = (run: ScoringRun | null | undefined) =>
  run && run.result && run.scored_at ? `${run.id}|${run.scored_at}|${run.result}` : null;

const isLater = (next: string | null | undefined, previous: string | null) => {
  if (!next) {
    return false;
  }

  if (!previous) {
    return true;
  }

  const nextTime = Date.parse(next);
  const previousTime = Date.parse(previous);

  return Number.isFinite(nextTime) && Number.isFinite(previousTime)
    ? nextTime > previousTime
    : next > previous;
};

type Baseline = { key: string | null; scoredAt: string | null };

/* Returns the just-scored run for RESULT_FLASH_MS after `last_scored_run`
   changes to a newer result, otherwise null.
   - Nothing flashes until `ready` (the first payload has arrived): opening a
     page must not replay a result from twenty minutes ago.
   - A change to an older run (a judge undid the latest result) moves the
     baseline without flashing; recording it again flashes. */
export function useResultFlash(
  run: ScoringRun | null | undefined,
  ready: boolean,
  durationMs = RESULT_FLASH_MS
) {
  const key = flashKey(run);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [flashing, setFlashing] = useState<ScoringRun | null>(null);

  // Adjusting state while rendering when an input changes (React's
  // "storing information from previous renders" pattern) — no effect needed.
  if (ready && (baseline === null || baseline.key !== key)) {
    const scoredAt = run?.scored_at ?? null;

    if (baseline !== null && run && key && isLater(scoredAt, baseline.scoredAt)) {
      setFlashing(run);
    }

    setBaseline({ key, scoredAt });
  }

  useEffect(() => {
    if (!flashing) {
      return;
    }

    const timer = setTimeout(() => setFlashing(null), durationMs);
    return () => clearTimeout(timer);
  }, [flashing, durationMs]);

  return flashing;
}

/* The latest result. With `persist`, always shows the most recent result and
   highlights it for four seconds when a new one lands (the public
   scoreboard); without, it appears only for those four seconds. */
export default function ResultFlash({
  run,
  ready,
  tone = "light",
  persist = false,
  label = "Last result",
  className = "",
}: {
  run: ScoringRun | null | undefined;
  ready: boolean;
  tone?: "light" | "dark";
  persist?: boolean;
  label?: string;
  className?: string;
}) {
  const flashing = useResultFlash(run, ready);
  const shown = flashing ?? (persist ? (run ?? null) : null);

  if (!shown || !shown.result) {
    return null;
  }

  const isFlashing = flashing !== null;
  const pool = poolName(shown.pool_label);
  const frame =
    tone === "dark"
      ? isFlashing
        ? "border-bronze bg-bronze-deep text-cream"
        : "border-cream/15 bg-white/5 text-cream"
      : isFlashing
        ? "border-bronze bg-cream text-ink"
        : "border-bronze/20 bg-cream/70 text-ink";

  return (
    <section
      aria-live="polite"
      aria-atomic="true"
      className={`rounded-xl border-2 px-4 py-3 ${frame} ${isFlashing ? "nbp-flash" : ""} ${className}`}
    >
      <p
        className={`font-display text-xs font-semibold uppercase tracking-[0.2em] ${
          tone === "dark" ? "text-cream/70" : "text-bronze-dark"
        }`}
      >
        {isFlashing ? "Just scored" : label}
        {pool ? ` · ${pool}` : ""}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="min-w-0 break-words font-display text-2xl font-bold uppercase leading-tight tracking-wide">
          {shown.rider_name}
        </p>
        <ResultBadge result={shown.result} tone={tone} size="lg" />
      </div>
    </section>
  );
}
