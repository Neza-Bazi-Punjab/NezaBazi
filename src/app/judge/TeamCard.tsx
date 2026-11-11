"use client";

// The judges' panel, team rounds: score a whole team in one go.
//
// A team's four riders go down the track together, so starting and scoring
// them one at a time is too slow. This card lists the next team's riders;
// the judge taps 4, 2 or 0 for each and saves once. Each rider still gets
// their own result (the team's points are their sum, as everywhere else):
// the card only sends the four results one after the other.
//
// It is an extra way in: Start and the result cards below it work as before.
import { useState } from "react";
import type { RunResult, ScoringRun } from "@/lib/scoring/types";

const CHOICES: readonly { result: RunResult; points: number; label: string }[] = [
  { result: "carry", points: 4, label: "Carried" },
  { result: "strike", points: 2, label: "Struck" },
  { result: "miss", points: 0, label: "Miss" },
];

export type TeamPick = { run: ScoringRun; result: RunResult };

export default function TeamCard({
  teamName,
  runs,
  target,
  busy,
  onSave,
}: {
  teamName: string;
  /* The team's rides still to be scored, in riding order. */
  runs: ScoringRun[];
  /* The round's target, when it has one. */
  target: number | null;
  busy: boolean;
  onSave: (picks: TeamPick[]) => void;
}) {
  const [picked, setPicked] = useState<Record<string, RunResult>>({});

  /* Picks for rides no longer on the card (another team came up) are ignored. */
  const picks = runs.flatMap((run) => (picked[run.id] ? [{ run, result: picked[run.id] }] : []));
  const total = picks.reduce(
    (sum, pick) => sum + (CHOICES.find((choice) => choice.result === pick.result)?.points ?? 0),
    0
  );
  const complete = picks.length === runs.length && runs.length > 0;

  return (
    <section
      aria-label={`Score ${teamName}`}
      className="flex flex-col gap-2 border-[3px] border-[var(--ledger-rule)] bg-[var(--ledger-panel)] p-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[20px] font-bold uppercase leading-tight">{teamName}</h2>
        <span className="mono text-[13px] uppercase text-[var(--ledger-bronze)]">
          Score the whole team{target !== null ? ` · target ${target}` : ""}
        </span>
      </div>

      {runs.map((run, index) => (
        <div
          key={run.id}
          className="flex flex-wrap items-center gap-2 border-t border-[var(--ledger-rule)] pt-2"
        >
          <span className="min-w-0 grow basis-40 text-[17px] font-bold">
            <span className="mono mr-2 text-[13px] text-[var(--ledger-bronze)]">{index + 1}</span>
            {run.rider_name}
          </span>
          <span className="flex gap-1.5">
            {CHOICES.map((choice) => {
              const on = picked[run.id] === choice.result;

              return (
                <button
                  key={choice.result}
                  type="button"
                  disabled={busy}
                  aria-pressed={on}
                  aria-label={`${run.rider_name}: ${choice.label} ${choice.points}`}
                  onClick={() => setPicked((current) => ({ ...current, [run.id]: choice.result }))}
                  className={`h-12 min-w-[3.5rem] border-[3px] px-3 text-[20px] font-bold disabled:opacity-40 ${
                    on
                      ? "border-[var(--ledger-ink)] bg-[var(--ledger-ink)] text-[var(--ledger-paper)]"
                      : "border-[var(--ledger-rule)] bg-transparent"
                  }`}
                >
                  {choice.points}
                </button>
              );
            })}
          </span>
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t-[3px] border-[var(--ledger-rule)] pt-2">
        <span className="text-[20px] font-bold" aria-live="polite">
          Total {total}
          {complete && target !== null ? (total >= target ? " · through" : " · not through") : ""}
        </span>
        <button
          type="button"
          disabled={busy || !complete}
          onClick={() => onSave(picks)}
          className="min-h-[50px] bg-[var(--ledger-ink)] px-[18px] text-[17px] font-bold uppercase text-[var(--ledger-paper)] active:opacity-90 disabled:opacity-40"
        >
          {complete ? `Save ${teamName} · ${total}` : "Tap a score for each rider"}
        </button>
      </div>
    </section>
  );
}
