"use client";

/* The pieces of the public live leaderboard, drawn in the same "ledger" look
   as the judges' and commentary panels: cream paper, brown rules, condensed
   type with mono labels. Built for a hand-held screen first (one column,
   44px touch targets, long names wrap instead of being cut), and simply
   given more room from `sm` up.

   Everything here shows the public live state only: run snapshots and the
   public standings, never anything from a registration. */
import { useState } from "react";
import { advanceText, poolName, standingsFor } from "@/components/scoring/format";
import "@/components/scoring/scoring.css";
import { plural } from "@/lib/scoring/format";
import {
  RESULT_LABELS,
  RESULT_POINTS,
  shortLocation,
  type EventType,
  type LeaderboardRow,
  type PodiumEntry,
  type PoolRosterEntry,
  type RunResult,
  type RunStatus,
  type ScoringRound,
  type ScoringRun,
} from "@/lib/scoring/types";
import type { LiveConnection } from "@/lib/scoring/use-live-state";

export const label = "mono text-[11px] uppercase tracking-[0.04em] text-[var(--ledger-muted)]";

/* A square mono button: the tabs, the pool letters, "show standings". */
export const ledgerButton = (active = false) =>
  `mono min-h-12 border-2 px-4 text-[13px] font-semibold uppercase transition-colors ${
    active
      ? "border-[var(--ledger-ink)] bg-[var(--ledger-ink)] text-[var(--ledger-paper)]"
      : "border-[var(--ledger-ink)] bg-transparent text-[var(--ledger-ink)] active:bg-[var(--ledger-pick)]"
  }`;

const RESULT_COLOUR: Record<RunResult, string> = {
  carry: "text-[var(--ledger-green)]",
  strike: "text-[var(--ledger-ink)]",
  miss: "text-[var(--ledger-miss)]",
};

const RUN_STATUS_WORD: Record<RunStatus, string> = {
  pending: "To ride",
  on_course: "Riding",
  scored: "Scored",
  void: "Skipped",
};

/* ------------------------------------------------------------------------ */
/* The brown bar under the site menu: what is riding, and whether the page is
   up to date. The words carry the meaning; the dot is decoration. */

const CONNECTION_WORD: Record<LiveConnection, string> = {
  live: "Live",
  polling: "Updating",
  offline: "Offline",
};

const CONNECTION_DESCRIPTION: Record<LiveConnection, string> = {
  live: "Live: updates arrive instantly.",
  polling: "Updating every few seconds.",
  offline: "Offline: showing the last update. Retrying.",
};

export function LiveStatusBar({
  text,
  connection,
}: {
  text: string;
  connection: LiveConnection;
}) {
  const offline = connection === "offline";

  return (
    <div
      className={`mono flex min-h-9 items-center justify-between gap-3 px-4 py-1.5 text-[12px] uppercase text-[var(--ledger-paper)] ${
        offline ? "bg-[var(--ledger-red)]" : "bg-[var(--ledger-rule)]"
      }`}
    >
      <span className="min-w-0 break-words">{text}</span>
      <span role="status" title={CONNECTION_DESCRIPTION[connection]} className="shrink-0">
        <span aria-hidden className={connection === "live" ? "nbp-pulse" : ""}>
          ●
        </span>{" "}
        <span aria-hidden>{CONNECTION_WORD[connection]}</span>
        <span className="sr-only">{CONNECTION_DESCRIPTION[connection]}</span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Who is riding and who is up next, kept small: riders watch this to know
   when to get ready. The leaderboard below stays the main thing. */

export function UpNext({
  current,
  next,
  limit = 3,
}: {
  current: ScoringRun | null | undefined;
  next: ScoringRun[];
  limit?: number;
}) {
  const shown = next.slice(0, limit);

  if (!current && shown.length === 0) {
    return null;
  }

  const nextPool = shown[0] ? poolName(shown[0].pool_label) : null;

  return (
    <section
      aria-label="Riding now and up next"
      className="border-[3px] border-[var(--ledger-rule)] bg-[var(--ledger-panel)] px-3 py-2"
    >
      {current && (
        <p className="flex flex-col border-b border-[var(--ledger-hair)] pb-2">
          <span className="mono text-[11px] uppercase text-[var(--ledger-bronze)]">
            <span aria-hidden className="nbp-pulse">
              ●
            </span>{" "}
            Riding now
          </span>
          <span className="break-words text-[22px] font-bold uppercase leading-tight">
            {current.rider_name}
          </span>
        </p>
      )}
      {shown.length > 0 && (
        <div className={current ? "pt-2" : ""}>
          <p className={label}>
            Up next
            {nextPool ? ` · ${nextPool}` : ""}
          </p>
          <ol className="mt-0.5 flex flex-col">
            {shown.map((run, index) => (
              <li key={run.id} className="grid grid-cols-[18px_minmax(0,1fr)] gap-2 py-0.5">
                <span className="mono pt-[3px] text-right text-[12px] text-[var(--ledger-muted)]">
                  {index + 1}
                </span>
                <span className="break-words text-[17px] font-semibold uppercase leading-tight">
                  {run.rider_name}
                  {run.team_name && (
                    <span className="text-[13px] font-normal normal-case text-[var(--ledger-muted)]">
                      {" "}
                      · {run.team_name}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* A decided round's first three. */

const PLACE_TEXT: Record<PodiumEntry["place"], string> = { 1: "1st", 2: "2nd", 3: "3rd" };

export function Podium({ round }: { round: ScoringRound }) {
  const podium = Array.isArray(round.podium)
    ? [...round.podium].sort((a, b) => a.place - b.place)
    : [];

  if (podium.length === 0) {
    return null;
  }

  return (
    <ol className="mb-4 grid gap-1.5 sm:grid-cols-3">
      {podium.map((entry) => (
        <li
          key={`${entry.place}-${entry.entrant_key}`}
          className={`flex items-baseline gap-3 border-2 px-3 py-2 sm:flex-col sm:gap-0.5 ${
            entry.place === 1
              ? "border-[var(--ledger-ink)] bg-[var(--ledger-ink)] text-[var(--ledger-paper)]"
              : "border-[var(--ledger-rule)] bg-[var(--ledger-panel)]"
          }`}
        >
          <span className="mono w-9 shrink-0 text-[13px] font-semibold uppercase">
            {PLACE_TEXT[entry.place] ?? entry.place}
          </span>
          <span className="min-w-0 break-words text-[20px] font-bold uppercase leading-tight">
            {entry.name}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------------ */
/* Pool letters: A, B, … and All. */

function PoolPicker({
  pools,
  selected,
  onSelect,
}: {
  pools: string[];
  selected: string | null;
  onSelect: (pool: string | null) => void;
}) {
  const choices: (string | null)[] = [...pools, null];

  return (
    <div role="group" aria-label="Choose a pool" className="mb-3 flex flex-wrap gap-1.5">
      {choices.map((pool) => {
        const active = pool === selected;

        return (
          <button
            key={pool ?? "all"}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(pool)}
            className={`mono min-h-11 min-w-11 border-2 px-3 text-[13px] font-semibold uppercase transition-colors ${
              active
                ? "border-[var(--ledger-ink)] bg-[var(--ledger-ink)] text-[var(--ledger-paper)]"
                : "border-[var(--ledger-chip)] bg-transparent text-[var(--ledger-ink)] active:bg-[var(--ledger-pick)]"
            }`}
          >
            {pool === null ? (
              "All"
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

/* ------------------------------------------------------------------------ */
/* Round standings, per pool or for the whole round. Single: one row per
   rider with their points. Section: one row per team with its total against
   the round's target; tap a team to see its four riders. */

function StatusTag({
  row,
  riding,
  upNext,
}: {
  row: LeaderboardRow;
  riding: boolean;
  upNext: boolean;
}) {
  const text = advanceText(row);

  if (!text) {
    return riding ? (
      <span className="mono text-[11px] font-semibold uppercase text-[var(--ledger-bronze)]">
        Riding
      </span>
    ) : upNext ? (
      <span className="mono text-[11px] font-semibold uppercase text-[var(--ledger-ink)]">Next</span>
    ) : (
      <span className="mono text-[11px] text-[var(--ledger-faint)]">—</span>
    );
  }

  return (
    <span
      className={`mono text-[11px] font-semibold uppercase ${
        row.advanced ? "text-[var(--ledger-green)]" : "text-[var(--ledger-red)]"
      }`}
    >
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

/* The points box: green once the rider has carried, plain otherwise, and a
   dash until they have ridden. A rider's box shows their best run (4, 2 or
   0), which is what decides a round with several attempts; a team's shows
   its total. */
function PointsBox({
  row,
  target,
  total,
}: {
  row: LeaderboardRow;
  target: number | null;
  total: boolean;
}) {
  const ridden = row.runs_scored > 0;
  const carried = !total && row.best_result === "carry";
  const points = !total && row.best_result ? RESULT_POINTS[row.best_result] : row.points;

  return (
    <span className="flex flex-col items-stretch">
      <span
        className={`mono flex h-9 items-center justify-center border text-[16px] font-semibold ${
          !ridden
            ? "border-[var(--ledger-hair)] text-[var(--ledger-faint)]"
            : carried
              ? "border-[var(--ledger-green)] bg-[var(--ledger-green)] text-[var(--ledger-paper)]"
              : "border-[var(--ledger-chip)] bg-[var(--ledger-panel)] text-[var(--ledger-ink)]"
        }`}
      >
        {ridden ? points : "–"}
        <span className="sr-only">{ridden ? " points" : " not ridden yet"}</span>
      </span>
      {target ? (
        <span className="mono mt-0.5 text-center text-[10px] text-[var(--ledger-muted)]">
          of {target}
        </span>
      ) : null}
    </span>
  );
}

const STANDING_GRID = "grid grid-cols-[26px_minmax(0,1fr)_46px_58px] items-center gap-2";

export function Standings({
  rows,
  eventType,
  pools = [],
  pool,
  onPoolChange,
  targetPoints = null,
  highlightKey = null,
  nextKey = null,
  caption = "Standings",
  emptyText = "No results yet.",
}: {
  rows: LeaderboardRow[];
  eventType: EventType;
  pools?: string[];
  /* The pool shown (null = whole round). */
  pool: string | null;
  onPoolChange: (pool: string | null) => void;
  targetPoints?: number | null;
  highlightKey?: string | null;
  /* The entrant who rides next: tagged "Next" until they are on course. */
  nextKey?: string | null;
  caption?: string;
  emptyText?: string;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const selected = pool !== null && pools.includes(pool) ? pool : null;
  const byPool = selected !== null;
  const shown = standingsFor(rows, selected);
  const isSection = eventType === "section";
  const anyOverride = shown.some((row) => row.advanced_overridden);

  const toggle = (key: string) =>
    setExpanded((current) => ({ ...current, [key]: !current[key] }));

  return (
    <div>
      {pools.length > 0 && <PoolPicker pools={pools} selected={selected} onSelect={onPoolChange} />}

      {shown.length === 0 ? (
        <p className="border border-[var(--ledger-hair)] bg-[var(--ledger-panel)] px-4 py-6 text-center text-[var(--ledger-muted)]">
          {emptyText}
        </p>
      ) : (
        <div role="table" aria-label={`${caption}${byPool ? `, Pool ${selected}` : ""}`}>
          <div role="rowgroup">
            <div
              role="row"
              className={`${STANDING_GRID} mono border-b-[3px] border-[var(--ledger-rule)] px-1 pb-1 text-[10px] uppercase text-[var(--ledger-muted)]`}
            >
              <span role="columnheader" className="text-right">
                #
              </span>
              <span role="columnheader">{isSection ? "Team" : "Rider"}</span>
              <span role="columnheader" className="text-center">
                Pts
              </span>
              <span role="columnheader">Status</span>
            </div>
          </div>
          <div role="rowgroup" className="flex flex-col">
            {shown.map((row) => {
              const rank = byPool ? row.pool_rank : row.rank;
              const isOpen = Boolean(expanded[row.entrant_key]);
              const detailId = `standing-${row.entrant_key.replace(/[^a-z0-9]/gi, "")}`;
              const riding = row.entrant_key === highlightKey;
              const hasMembers = isSection && Boolean(row.members && row.members.length > 0);
              const sub = isSection
                ? `${row.runs_scored}/${plural(row.runs_total, "run")}`
                : [row.horse_name, shortLocation(row.location)].filter(Boolean).join(" · ");

              return (
                <div
                  key={row.entrant_key}
                  className={`border-b border-[var(--ledger-hair)] ${
                    riding ? "bg-[var(--ledger-hl)]" : ""
                  }`}
                >
                  <div role="row" className={`${STANDING_GRID} px-1 py-2`}>
                    <span
                      role="cell"
                      className="mono text-right text-[14px] font-semibold text-[var(--ledger-muted)]"
                    >
                      {rank}
                    </span>
                    <span role="cell" className="flex min-w-0 flex-col">
                      {hasMembers ? (
                        <button
                          type="button"
                          onClick={() => toggle(row.entrant_key)}
                          aria-expanded={isOpen}
                          aria-controls={detailId}
                          className="-my-1 flex min-h-11 w-full items-center gap-2 bg-transparent text-left"
                        >
                          <span aria-hidden className="mono shrink-0 text-[13px]">
                            {isOpen ? "▾" : "▸"}
                          </span>
                          <span className="min-w-0 break-words text-[18px] font-bold uppercase leading-tight">
                            {row.name}
                          </span>
                          <span className="sr-only">
                            {isOpen ? ", hide riders" : ", show riders"}
                          </span>
                        </button>
                      ) : (
                        <span className="break-words text-[18px] font-bold uppercase leading-tight">
                          {row.name}
                        </span>
                      )}
                      {sub && (
                        <span className="mt-0.5 break-words text-[13px] leading-tight text-[var(--ledger-muted)]">
                          {sub}
                        </span>
                      )}
                    </span>
                    <span role="cell">
                      <PointsBox
                        row={row}
                        target={isSection ? targetPoints : null}
                        total={isSection}
                      />
                    </span>
                    <span role="cell">
                      <StatusTag row={row} riding={riding} upNext={row.entrant_key === nextKey} />
                    </span>
                  </div>
                  {hasMembers && isOpen && row.members && (
                    <ol
                      id={detailId}
                      className="mb-2 ml-[34px] flex flex-col border-l-[3px] border-[var(--ledger-rule)] bg-[var(--ledger-side)] px-3 py-1"
                    >
                      {row.members.map((member, index) => (
                        <li
                          key={member.team_member_id ?? `${row.entrant_key}-${index}`}
                          className="flex items-baseline justify-between gap-3 border-b border-[var(--ledger-hair)] py-1.5 last:border-b-0"
                        >
                          <span className="min-w-0 break-words">
                            <span className="text-[16px] font-semibold">{member.rider_name}</span>
                            {member.horse_name && (
                              <span className="text-[13px] text-[var(--ledger-muted)]">
                                {" "}
                                · {member.horse_name}
                              </span>
                            )}
                          </span>
                          <span
                            className={`mono shrink-0 text-[12px] font-semibold uppercase ${
                              member.result
                                ? RESULT_COLOUR[member.result]
                                : member.status === "on_course"
                                  ? "text-[var(--ledger-bronze)]"
                                  : "text-[var(--ledger-muted)]"
                            }`}
                          >
                            {member.result
                              ? `${RESULT_LABELS[member.result]} ${RESULT_POINTS[member.result]}`
                              : RUN_STATUS_WORD[member.status]}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {anyOverride && (
        <p className="mt-2 text-[12px] text-[var(--ledger-muted)]">* Decided by the judges.</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Who rides in one pool, in start order: one name to a line, a team's four
   riders under the team name. `highlight` is the "find your pool" box. */

export function Roster({
  entries,
  highlight,
  className = "",
}: {
  entries: PoolRosterEntry[];
  highlight?: string;
  className?: string;
}) {
  const needle = highlight?.trim().toLowerCase() ?? "";

  if (entries.length === 0) {
    return (
      <p className={`text-[var(--ledger-muted)] ${className}`}>No riders drawn into this pool yet.</p>
    );
  }

  const matches = (entry: PoolRosterEntry) =>
    needle !== "" &&
    [entry.name, entry.team_name, ...(entry.members ?? [])]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle));

  return (
    <ol className={`flex flex-col ${className}`}>
      {entries.map((entry, index) => {
        const hasMembers = Boolean(entry.members && entry.members.length > 0);

        return (
          <li
            key={entry.entrant_key}
            className={`grid grid-cols-[26px_minmax(0,1fr)] gap-2 border-b border-[var(--ledger-hair)] px-1 py-1.5 ${
              matches(entry) ? "bg-[var(--ledger-pick)] outline outline-2 outline-[var(--ledger-bronze)]" : ""
            }`}
          >
            <span className="mono pt-0.5 text-right text-[12px] text-[var(--ledger-muted)]">
              {index + 1}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="break-words text-[17px] font-bold uppercase leading-tight">
                {entry.name}
              </span>
              {hasMembers && (
                <span className="mt-0.5 break-words text-[13px] leading-tight text-[var(--ledger-muted)]">
                  {(entry.members ?? []).join(" · ")}
                </span>
              )}
              {!hasMembers && entry.horse_name && (
                <span className="break-words text-[13px] leading-tight text-[var(--ledger-muted)]">
                  {entry.horse_name}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
