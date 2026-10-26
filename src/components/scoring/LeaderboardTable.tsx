"use client";

import { useState } from "react";
import {
  shortLocation,
  type EventType,
  type LeaderboardRow,
} from "@/lib/scoring/types";
import { advanceText, standingsFor } from "./format";
import ResultBadge from "./ResultBadge";

/* Round standings, per pool (tabs A, B, …, All) or for the whole round.
   Single: one row per rider with their best result. Section: one row per team
   with the points summed against the round's target; tap a team to see its
   four riders. Everything shown comes from the leaderboard view (run
   snapshots), never from a registration. */

type Tone = "light" | "dark";

const toneClasses = (tone: Tone) =>
  tone === "dark"
    ? {
        frame: "border-cream/15",
        head: "bg-white/5 text-cream/70",
        rowBorder: "border-cream/10",
        muted: "text-cream/70",
        faint: "text-cream/50",
        highlight: "bg-bronze/30",
        tab: "border-cream/25 text-cream hover:border-cream/60",
        tabActive: "border-bronze bg-bronze text-cream",
        through: "text-emerald-300",
        out: "text-cream/55",
        members: "bg-white/5",
      }
    : {
        frame: "border-bronze/20 bg-cream/70",
        head: "bg-parchment/70 text-brown",
        rowBorder: "border-bronze/10",
        muted: "text-brown/75",
        faint: "text-brown/55",
        highlight: "bg-bronze/10",
        tab: "border-brown/25 text-brown hover:border-bronze",
        tabActive: "border-bronze-deep bg-bronze-deep text-cream",
        through: "text-emerald-800",
        out: "text-brown/60",
        members: "bg-parchment/50",
      };

function AdvanceCell({ row, tone }: { row: LeaderboardRow; tone: Tone }) {
  const text = advanceText(row);
  const classes = toneClasses(tone);

  if (!text) {
    return <span className={classes.faint}>—</span>;
  }

  return (
    <span
      className={`inline-flex items-center gap-1 font-display text-xs font-semibold uppercase tracking-[0.12em] ${
        row.advanced ? classes.through : classes.out
      }`}
    >
      {row.advanced && (
        <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
          <path d="M2 6.5 5 9l5-6" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      )}
      {text}
      {row.advanced_overridden && (
        <>
          <span aria-hidden>*</span>
          <span className="sr-only"> (decided by the judges)</span>
        </>
      )}
    </span>
  );
}

export function PoolTabs({
  pools,
  selected,
  onSelect,
  tone = "light",
  allLabel = "All",
  className = "",
}: {
  pools: string[];
  selected: string | null;
  onSelect: (pool: string | null) => void;
  tone?: Tone;
  allLabel?: string;
  className?: string;
}) {
  const classes = toneClasses(tone);
  const choices: (string | null)[] = [...pools, null];

  return (
    <div role="group" aria-label="Choose a pool" className={`flex flex-wrap gap-2 ${className}`}>
      {choices.map((pool) => {
        const active = pool === selected;

        return (
          <button
            key={pool ?? "all"}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(pool)}
            className={`min-h-11 min-w-11 rounded-lg border px-3 font-display text-sm font-semibold uppercase tracking-[0.12em] transition-colors ${
              active ? classes.tabActive : classes.tab
            }`}
          >
            {pool === null ? (
              allLabel
            ) : (
              <>
                <span className="sr-only">Pool </span>
                {pool}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function LeaderboardTable({
  rows,
  eventType,
  pools = [],
  tone = "light",
  pool,
  defaultPool = null,
  onPoolChange,
  showPoolTabs = true,
  targetPoints = null,
  highlightKey = null,
  caption = "Standings",
  emptyText = "No results yet.",
  dense = false,
  maxRows,
  className = "",
}: {
  rows: LeaderboardRow[];
  eventType: EventType;
  pools?: string[];
  tone?: Tone;
  /* Controlled pool (null = whole round). Leave undefined to let the tabs
     manage it, starting from `defaultPool`. */
  pool?: string | null;
  defaultPool?: string | null;
  onPoolChange?: (pool: string | null) => void;
  showPoolTabs?: boolean;
  targetPoints?: number | null;
  highlightKey?: string | null;
  caption?: string;
  emptyText?: string;
  dense?: boolean;
  maxRows?: number;
  className?: string;
}) {
  const [ownPool, setOwnPool] = useState<string | null>(defaultPool);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const classes = toneClasses(tone);
  const requested = pool !== undefined ? pool : ownPool;
  const selected = requested !== null && pools.includes(requested) ? requested : null;
  const byPool = selected !== null;
  const sorted = standingsFor(rows, selected);
  const shown = maxRows ? sorted.slice(0, maxRows) : sorted;
  const isSection = eventType === "section";
  const cell = dense ? "px-2 py-1.5" : "px-3 py-2.5";
  const anyOverride = shown.some((row) => row.advanced_overridden);

  const choosePool = (next: string | null) => {
    setOwnPool(next);
    onPoolChange?.(next);
  };

  const toggle = (key: string) =>
    setExpanded((current) => ({ ...current, [key]: !current[key] }));

  return (
    <div className={className}>
      {showPoolTabs && pools.length > 0 && (
        <PoolTabs
          pools={pools}
          selected={selected}
          onSelect={choosePool}
          tone={tone}
          className="mb-3"
        />
      )}

      {shown.length === 0 ? (
        <p className={`rounded-xl border px-4 py-6 text-center ${classes.frame} ${classes.muted}`}>
          {emptyText}
        </p>
      ) : (
        <div className={`overflow-hidden rounded-xl border ${classes.frame}`}>
          <table className="w-full table-fixed border-collapse text-left">
            <caption className="sr-only">
              {caption}
              {byPool ? `, Pool ${selected}` : ""}
            </caption>
            <colgroup>
              <col className={dense ? "w-9" : "w-11"} />
              <col />
              <col className={isSection ? "w-16" : dense ? "w-24" : "w-28"} />
              <col className={dense ? "w-12" : "w-16"} />
              <col className={`hidden w-24 ${dense ? "" : "sm:table-column"}`} />
            </colgroup>
            <thead
              className={`font-display text-[11px] font-semibold uppercase tracking-[0.14em] ${classes.head}`}
            >
              <tr>
                <th scope="col" className={cell}>
                  #
                </th>
                <th scope="col" className={cell}>
                  {isSection ? "Team" : "Rider"}
                </th>
                <th scope="col" className={cell}>
                  {isSection ? "Runs" : "Best"}
                </th>
                <th scope="col" className={`${cell} text-right`}>
                  Pts
                </th>
                <th scope="col" className={`${cell} hidden ${dense ? "" : "sm:table-cell"}`}>
                  Status
                </th>
              </tr>
            </thead>
            {shown.map((row) => {
              const rank = byPool ? row.pool_rank : row.rank;
              const isOpen = Boolean(expanded[row.entrant_key]);
              const detailId = `lb-${row.entrant_key.replace(/[^a-z0-9]/gi, "")}`;
              const highlight = row.entrant_key === highlightKey;
              const sub = isSection
                ? null
                : [row.horse_name, shortLocation(row.location)].filter(Boolean).join(" · ");

              return (
                <tbody
                  key={row.entrant_key}
                  className={`border-t ${classes.rowBorder} ${highlight ? classes.highlight : ""}`}
                >
                  <tr className="align-top">
                    <td
                      className={`${cell} font-display text-lg font-bold tabular-nums ${classes.muted}`}
                    >
                      {rank}
                    </td>
                    <td className={`${cell} min-w-0`}>
                      {isSection && row.members && row.members.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => toggle(row.entrant_key)}
                          aria-expanded={isOpen}
                          aria-controls={detailId}
                          className="-my-1 flex min-h-11 w-full items-center gap-2 text-left"
                        >
                          <svg
                            viewBox="0 0 12 12"
                            aria-hidden
                            className={`h-3 w-3 shrink-0 transition-transform motion-reduce:transition-none ${
                              isOpen ? "rotate-90" : ""
                            }`}
                          >
                            <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" />
                          </svg>
                          <span className="min-w-0 break-words font-display font-semibold uppercase leading-tight tracking-wide">
                            {row.name}
                          </span>
                          <span className="sr-only">
                            {isOpen ? ", hide riders" : ", show riders"}
                          </span>
                        </button>
                      ) : (
                        <p className="break-words font-display font-semibold uppercase leading-tight tracking-wide">
                          {row.name}
                        </p>
                      )}
                      {sub && !dense && <p className={`mt-0.5 text-xs ${classes.muted}`}>{sub}</p>}
                      <p className={`mt-1 ${dense ? "" : "sm:hidden"}`}>
                        <AdvanceCell row={row} tone={tone} />
                      </p>
                    </td>
                    <td className={cell}>
                      {isSection ? (
                        <span className={`tabular-nums ${classes.muted}`}>
                          {row.runs_scored}/{row.runs_total}
                        </span>
                      ) : (
                        <ResultBadge
                          result={row.best_result}
                          status={row.runs_scored > 0 ? "scored" : "pending"}
                          tone={tone}
                          size="sm"
                          showPoints={false}
                        />
                      )}
                    </td>
                    <td className={`${cell} text-right font-display text-xl font-bold tabular-nums`}>
                      {row.points}
                      {isSection && targetPoints ? (
                        <span className={`block text-[11px] font-semibold ${classes.faint}`}>
                          of {targetPoints}
                        </span>
                      ) : null}
                    </td>
                    <td className={`${cell} hidden ${dense ? "" : "sm:table-cell"}`}>
                      <AdvanceCell row={row} tone={tone} />
                    </td>
                  </tr>
                  {isSection && isOpen && row.members && (
                    <tr id={detailId} className={classes.members}>
                      <td />
                      <td colSpan={4} className={cell}>
                        <ol className="space-y-1.5">
                          {row.members.map((member, index) => (
                            <li
                              key={member.team_member_id ?? `${row.entrant_key}-${index}`}
                              className="flex flex-wrap items-center justify-between gap-2"
                            >
                              <span className="min-w-0">
                                <span className="font-semibold">{member.rider_name}</span>
                                {member.horse_name && (
                                  <span className={`text-sm ${classes.muted}`}>
                                    {" "}
                                    · {member.horse_name}
                                  </span>
                                )}
                              </span>
                              <ResultBadge
                                result={member.result}
                                status={member.status}
                                tone={tone}
                                size="sm"
                              />
                            </li>
                          ))}
                        </ol>
                      </td>
                    </tr>
                  )}
                </tbody>
              );
            })}
          </table>
        </div>
      )}

      {anyOverride && (
        <p className={`mt-2 text-xs ${classes.muted}`}>* Decided by the judges.</p>
      )}
    </div>
  );
}
