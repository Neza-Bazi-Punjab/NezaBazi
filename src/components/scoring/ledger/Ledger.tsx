"use client";

/* Shared pieces of the judges' and commentary panels ("Live Scoring 6e"):
   the top strip, the brown status bar, the round chips and the all-pools
   list. Layout, sizes and colours follow the design; the words come from
   the app. */
import { useEffect, useState } from "react";
import type { PoolState, PoolSummary, RoundChip } from "@/lib/scoring/blocks";
import type { LiveConnection } from "@/lib/scoring/use-live-state";
import { ledgerFontVariables } from "./fonts";
import "./ledger.css";

export const LEDGER_ROOT = `ledger ${ledgerFontVariables}`;

/* "Neza Bazi Punjab / Amritsar Cup — Judge" | "Qualification · Round 1 · Pool C" */
export function TopStrip({
  who,
  where,
  children,
}: {
  who: string;
  where: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mono flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b-[3px] border-[var(--ledger-rule)] pb-2.5 text-[13px] uppercase">
      <span>Neza Bazi Punjab / Amritsar Cup — {who}</span>
      <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span>{where}</span>
        {children}
      </span>
    </div>
  );
}

/* Small mono button in the top strip (Start list, Rounds, Screens). */
export function StripButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mono h-8 border border-[var(--ledger-ink)] bg-transparent px-3 text-[12px] uppercase active:bg-[var(--ledger-pick)] disabled:opacity-35"
    >
      {children}
    </button>
  );
}

/* The time of day, ticking. Rendered after mount so the server's clock never
   disagrees with the browser's. */
function Clock() {
  const [now, setNow] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date().toTimeString().slice(0, 8));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return <span suppressHydrationWarning>{now ?? ""}</span>;
}

/* The brown bar along the bottom. */
export function StatusBar({
  role,
  items,
  connection,
  liveWord = "Online",
  offlineNote,
}: {
  role: string;
  items: (string | null | undefined | false)[];
  connection: LiveConnection;
  liveWord?: string;
  offlineNote?: string;
}) {
  const offline = connection === "offline";

  return (
    <div
      className={`mono flex min-h-8 flex-wrap items-center gap-x-7 gap-y-1 px-5 py-1.5 text-[12px] uppercase text-[var(--ledger-paper)] ${
        offline ? "bg-[var(--ledger-red)]" : "bg-[var(--ledger-rule)]"
      }`}
    >
      <span className="text-[#f2b07a]">{role}</span>
      {items.filter(Boolean).map((item) => (
        <span key={item as string}>{item}</span>
      ))}
      <span className="ml-auto" role="status">
        {/* "polling" still reaches the server, every few seconds instead of
            at once (training always polls), so it counts as connected. */}
        ● {offline ? "Offline" : liveWord}
        {offline && offlineNote ? ` — ${offlineNote}` : ""}
      </span>
      <Clock />
    </div>
  );
}

/* Round 1 13/16 · Round 2 0/13 · Round 3 0/13 */
export function RoundChips({ chips }: { chips: RoundChip[] }) {
  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${chips.length}, minmax(0, 1fr))` }}>
      {chips.map((chip) => (
        <div
          key={chip.attempt}
          className={`mono flex items-baseline justify-between border px-2 py-[5px] text-[11px] uppercase ${
            chip.current
              ? "border-[var(--ledger-ink)] bg-[var(--ledger-ink)] text-[var(--ledger-paper)]"
              : chip.finished
                ? "border-[var(--ledger-green)] text-[var(--ledger-green)]"
                : "border-[var(--ledger-chip)] text-[var(--ledger-muted)]"
          }`}
        >
          <span className="font-semibold">Round {chip.attempt}</span>
          <span>{chip.total > 0 ? `${chip.done}/${chip.total}` : "—"}</span>
        </div>
      ))}
    </div>
  );
}

/* "Riding · R1", "Round 1 done", "Up next · R2" … "R" only when riders have
   more than one attempt. */
export const poolStateText = (state: PoolState, rounds: boolean) => {
  const r = (attempt: number) => (rounds ? ` · R${attempt}` : "");

  switch (state.kind) {
    case "riding":
      return `Riding${r(state.attempt)}`;
    case "up_next":
      return `Up next${r(state.attempt)}`;
    case "waiting":
      return `Waiting${r(state.attempt)}`;
    case "round_done":
      return rounds ? `Round ${state.attempt} done` : "Done";
    case "all_through":
      return "All through";
    case "done":
      return "Done";
  }
};

const poolStateColour = (state: PoolState) =>
  state.kind === "riding"
    ? "text-[var(--ledger-bronze)]"
    : state.kind === "round_done" || state.kind === "done" || state.kind === "all_through"
      ? "text-[var(--ledger-rule)]"
      : state.kind === "up_next"
        ? "text-[var(--ledger-ink)]"
        : "text-[#a08a70]";

const RIDER_STATUS: Record<NonNullable<PoolSummary["entrants"][number]["status"]>, [string, string]> = {
  through: ["Through", "text-[var(--ledger-green)]"],
  out: ["Out", "text-[var(--ledger-red)]"],
  riding: ["Riding now", "text-[var(--ledger-bronze)]"],
  up_next: ["Up next", "text-[var(--ledger-ink)]"],
};

/* All pools: "Pool A 1/6 through" and its state, then the riders. `compact`
   is the commentary column (smaller type; only `openPool` lists its riders). */
export function PoolList({
  pools,
  rounds,
  compact = false,
  openPool,
}: {
  pools: PoolSummary[];
  rounds: boolean;
  compact?: boolean;
  openPool?: string | null;
}) {
  return (
    <div className="flex flex-col gap-3.5">
      {pools.map((summary) => {
        const showRiders = !compact || summary.pool === openPool;

        return (
          <section key={summary.pool} aria-label={`Pool ${summary.pool}`} className="flex flex-col">
            <div
              className={`flex items-baseline justify-between gap-2 ${
                compact ? "text-[13px]" : "border-b border-[var(--ledger-rule)] pb-[3px] text-[15px]"
              }`}
            >
              <span className="font-bold uppercase">
                Pool {summary.pool}{" "}
                <span
                  className={`mono font-medium text-[var(--ledger-green)] ${compact ? "text-[10px]" : "text-[11px]"}`}
                >
                  {summary.through}/{summary.size} through
                </span>
              </span>
              <span className={`mono text-[11px] uppercase ${compact ? "font-bold" : ""} ${poolStateColour(summary.state)}`}>
                {poolStateText(summary.state, rounds)}
              </span>
            </div>
            {showRiders &&
              summary.entrants.map((entrant, index) => {
                const [text, colour] = entrant.status ? RIDER_STATUS[entrant.status] : ["", ""];

                return (
                  <div
                    key={entrant.entrant_key}
                    className={`grid gap-2 ${compact ? "grid-cols-[18px_minmax(0,1fr)_auto]" : "grid-cols-[22px_minmax(0,1fr)_auto]"} ${
                      compact ? "py-px text-[12px]" : "px-1 py-[3px] text-[14px]"
                    } ${entrant.status === "riding" ? "bg-[var(--ledger-hl)]" : ""}`}
                  >
                    {/* Riding order in the pool: the same on every panel. */}
                    <span className="mono self-center text-right text-[11px] text-[var(--ledger-muted)]">
                      {index + 1}
                    </span>
                    <span className="truncate">{entrant.name}</span>
                    <span
                      className={`mono font-semibold uppercase ${compact ? "text-[10px]" : "text-[11px]"} ${colour}`}
                    >
                      {text}
                    </span>
                  </div>
                );
              })}
          </section>
        );
      })}
    </div>
  );
}
