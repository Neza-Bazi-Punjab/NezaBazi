"use client";

/* The pool builder on /admin/scoring: build a round's start list by tapping
   entrants in riding order. Each tap puts the entrant next in the current
   pool; "New pool" starts the next letter, so pools can be any size. Riders
   can be moved up or down, to another pool, or taken out before saving.
   Nothing is written until "Save start list", which the page confirms and
   sends as one request (scoring_save_start_list: one transaction). */
import { useMemo, useState } from "react";
import type { AdminScoringState } from "@/lib/scoring/admin-types";
import {
  builderAdd,
  builderCanStartPool,
  builderCount,
  builderFromRuns,
  builderHas,
  builderMoveToPool,
  builderPoolLabel,
  builderRemove,
  builderShift,
  builderStartPool,
  builderToSave,
  emptyBuilder,
  type BuilderPools,
} from "@/lib/scoring/pool-builder";
import { plural } from "@/lib/scoring/format";
import type { ScoringRound, ScoringRun } from "@/lib/scoring/types";

const primaryButton =
  "rounded-lg bg-bronze-deep px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-cream transition-colors hover:bg-bronze disabled:opacity-60";
const secondaryButton =
  "rounded-lg border border-bronze/20 px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40 disabled:opacity-60";
const smallButton =
  "rounded-md border border-bronze/20 px-2 py-1 text-sm text-bronze-dark transition-colors hover:border-bronze/40 disabled:opacity-40";
const inputClass =
  "mt-1 w-full rounded-lg border border-bronze/20 bg-cream px-3 py-2 text-brown focus:border-bronze focus:outline-none disabled:opacity-60";
const labelClass = "font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink";

type Entrant = { key: string; name: string; horse: string | null; checkedIn: boolean };

export default function PoolBuilder({
  round,
  runs,
  candidates,
  busy,
  scoredCount,
  onSave,
  onClose,
}: {
  round: ScoringRound;
  runs: ScoringRun[];
  candidates: AdminScoringState["candidates"];
  busy: boolean;
  scoredCount: number;
  onSave: (pools: string[][], labels: string[]) => void;
  onClose: () => void;
}) {
  const pooled = round.pool_size !== null;
  const isTeams = round.event_type === "section";
  const noun = isTeams ? "team" : "rider";

  /* Starts from the round's current start list, so a drawn list can be
     adjusted rather than rebuilt. */
  const [pools, setPools] = useState<BuilderPools>(() => builderFromRuns(runs));
  const [query, setQuery] = useState("");

  /* Every entrant of this event type, by key: who can be tapped (checked in)
     and the names of anyone already placed. */
  const entrants = useMemo(() => {
    const map = new Map<string, Entrant>();

    if (isTeams) {
      for (const team of candidates.teams) {
        map.set(`team:${team.id}`, {
          key: `team:${team.id}`,
          name: team.team_name,
          horse: team.horse_names.length > 0 ? team.horse_names.join(" · ") : null,
          checkedIn: team.member_count === 4 && team.checked_in_count === 4,
        });
      }
    } else {
      for (const rider of candidates.solo) {
        map.set(`solo:${rider.id}`, {
          key: `solo:${rider.id}`,
          name: rider.full_name,
          horse: rider.horse_name,
          checkedIn: rider.checked_in,
        });
      }
    }

    // A rider already in the start list keeps their name even if the
    // candidates list no longer has them.
    for (const run of runs) {
      if (!map.has(run.entrant_key)) {
        map.set(run.entrant_key, {
          key: run.entrant_key,
          name: run.team_name ?? run.rider_name,
          horse: run.team_name ? null : run.horse_name,
          checkedIn: false,
        });
      }
    }

    return map;
  }, [candidates, isTeams, runs]);

  const placedCount = builderCount(pools);
  const unplaced = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

    return [...entrants.values()]
      .filter((entrant) => entrant.checkedIn && !builderHas(pools, entrant.key))
      .filter((entrant) => {
        const text = `${entrant.name} ${entrant.horse ?? ""}`.toLowerCase();
        return words.every((word) => text.includes(word));
      })
      .sort((first, second) => first.name.localeCompare(second.name));
  }, [entrants, pools, query]);
  const waitingCount = [...entrants.values()].filter(
    (entrant) => entrant.checkedIn && !builderHas(pools, entrant.key)
  ).length;

  const currentIndex = pools.length - 1;
  const currentLabel = pooled ? builderPoolLabel(currentIndex) : null;
  const currentSize = pools[currentIndex]?.length ?? 0;
  /* The last entrant in the current pool: what "Undo" takes out. */
  const lastKey = currentSize > 0 ? pools[currentIndex][currentSize - 1] : null;
  const toSave = builderToSave(pools);
  const labels = toSave.map((_, index) => builderPoolLabel(index));
  const nameOf = (key: string) => entrants.get(key)?.name ?? "Unknown entrant";

  return (
    <section className="space-y-4 rounded-lg border-2 border-bronze/40 bg-sand p-4 sm:p-5" aria-label="Pool builder">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-display text-lg font-bold uppercase tracking-wide text-bronze-dark">
            Build Pools By Hand
          </h3>
          <p className="mt-1 text-sm leading-6 text-brown/80">
            Tap {isTeams ? "teams" : "riders"} in riding order: each goes next in the current pool.
            {pooled ? " “New pool” starts the next letter." : " This round has no pools: one list."}{" "}
            Nothing changes until you save.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPools(emptyBuilder())}
            disabled={busy || placedCount === 0}
            className={secondaryButton}
          >
            Start Over
          </button>
          <button type="button" onClick={onClose} disabled={busy} className={secondaryButton}>
            Close
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Tap to add */}
        <div className="space-y-3">
          <div className="sticky top-[var(--nav-height)] z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-bronze/30 bg-parchment px-3 py-2">
            <div className="min-w-0" aria-live="polite">
              <p className="text-sm font-semibold text-ink">
                {pooled ? `Adding to Pool ${currentLabel}` : "Adding to the list"} · {currentSize}
                {pooled && round.pool_size ? ` of about ${round.pool_size}` : ""}
              </p>
              {lastKey && (
                <p className="truncate text-xs text-brown/80">
                  Last: {nameOf(lastKey)} ({currentLabel ? `${currentLabel}${currentSize}` : `#${currentSize}`})
                </p>
              )}
            </div>
            {lastKey && (
              <button
                type="button"
                onClick={() => setPools(builderRemove(pools, lastKey))}
                disabled={busy}
                aria-label={`Undo: take ${nameOf(lastKey)} out`}
                className={secondaryButton}
              >
                Undo
              </button>
            )}
            {pooled && (
              <button
                type="button"
                onClick={() => setPools(builderStartPool(pools))}
                disabled={busy || !builderCanStartPool(pools)}
                className={primaryButton}
              >
                New Pool {builderPoolLabel(currentIndex + 1)}
              </button>
            )}
          </div>

          <label className="block">
            <span className={labelClass}>Find a {noun}</span>
            <input
              type="search"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={isTeams ? "Team or horse name" : "Rider or horse name"}
              className={inputClass}
            />
          </label>

          <p className="text-sm text-brown/80">
            {plural(waitingCount, isTeams ? "checked-in team" : "checked-in rider")} not placed yet
            {isTeams ? " (all four riders checked in)" : ""}.
          </p>

          {unplaced.length === 0 ? (
            <p className="rounded-lg border border-bronze/20 bg-cream px-3 py-4 text-sm text-brown/80">
              {waitingCount === 0
                ? `Every checked-in ${noun} is placed.`
                : `Nobody matches “${query.trim()}”.`}
            </p>
          ) : (
            <ul className="max-h-[28rem] space-y-1 overflow-y-auto rounded-lg border border-bronze/20 bg-cream p-1">
              {unplaced.map((entrant) => (
                <li key={entrant.key}>
                  <button
                    type="button"
                    onClick={() => setPools(builderAdd(pools, entrant.key))}
                    disabled={busy}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-3 text-left text-brown transition-colors hover:bg-parchment disabled:opacity-60"
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink">{entrant.name}</span>
                      {entrant.horse && (
                        <span className="block text-sm text-brown/75">{entrant.horse}</span>
                      )}
                    </span>
                    <span className="shrink-0 font-display text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-bronze-dark">
                      + {pooled ? `Pool ${currentLabel}` : "Add"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* The pools so far */}
        <div className="space-y-3">
          <p className="text-sm font-semibold text-ink">
            {plural(placedCount, noun)} placed
            {pooled ? ` in ${plural(toSave.length, "pool")}` : ""}
            {pooled && toSave.length > 0
              ? ` (${toSave.map((pool, index) => `${labels[index]} ${pool.length}`).join(" · ")})`
              : ""}
          </p>

          {pools.map((pool, poolIndex) => {
            const label = pooled ? builderPoolLabel(poolIndex) : null;
            const isCurrent = poolIndex === currentIndex;

            return (
              <div
                key={poolIndex}
                className={`rounded-lg border bg-cream ${isCurrent ? "border-bronze" : "border-bronze/20"}`}
              >
                <p className="border-b border-bronze/20 bg-parchment px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink">
                  {label ? `Pool ${label}` : "Start list"} · {pool.length}
                  {isCurrent && pooled ? " · adding here" : ""}
                </p>
                {pool.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-brown/70">Tap a {noun} to put them here.</p>
                ) : (
                  <ol>
                    {pool.map((key, position) => {
                      const entrant = entrants.get(key);
                      const name = nameOf(key);

                      return (
                        <li
                          key={key}
                          className="flex flex-wrap items-center gap-2 border-b border-bronze/10 px-3 py-2 last:border-0"
                        >
                          <span className="w-6 tabular-nums text-brown/70">{position + 1}</span>
                          <span className="min-w-[9rem] flex-1 font-semibold text-ink">
                            {name}
                            {entrant?.horse && (
                              <span className="block text-sm font-normal text-brown/75">{entrant.horse}</span>
                            )}
                            {entrant && !entrant.checkedIn && (
                              <span className="ml-2 font-normal text-red-800">not checked in</span>
                            )}
                          </span>
                          <span className="flex items-center gap-1">
                            <button
                              type="button"
                              aria-label={`Move ${name} earlier`}
                              onClick={() => setPools(builderShift(pools, key, -1))}
                              disabled={busy || position === 0}
                              className={smallButton}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              aria-label={`Move ${name} later`}
                              onClick={() => setPools(builderShift(pools, key, 1))}
                              disabled={busy || position === pool.length - 1}
                              className={smallButton}
                            >
                              ↓
                            </button>
                            {pooled && pools.length > 1 && (
                              <select
                                aria-label={`Move ${name} to another pool`}
                                value=""
                                disabled={busy}
                                onChange={(event) => {
                                  const target = Number(event.target.value);

                                  if (event.target.value !== "" && Number.isInteger(target)) {
                                    setPools(builderMoveToPool(pools, key, target));
                                  }
                                }}
                                className="rounded-md border border-bronze/20 bg-cream px-1 py-1 text-sm text-brown"
                              >
                                <option value="">Pool…</option>
                                {pools.map((_, index) =>
                                  index === poolIndex ? null : (
                                    <option key={index} value={index}>
                                      To {builderPoolLabel(index)}
                                    </option>
                                  )
                                )}
                              </select>
                            )}
                            <button
                              type="button"
                              aria-label={`Take ${name} out`}
                              onClick={() => setPools(builderRemove(pools, key))}
                              disabled={busy}
                              className={`${smallButton} text-red-800`}
                            >
                              ✕
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-bronze/20 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-brown/80">
          {scoredCount > 0
            ? "This round already has results — clear them before saving a new start list."
            : runs.length > 0
              ? "Saving replaces the current start list."
              : `${plural(round.attempts_per_rider, "attempt")} per ${isTeams ? "team rider" : "rider"}.`}
        </p>
        <button
          type="button"
          onClick={() => onSave(toSave, pooled ? labels : [])}
          disabled={busy || scoredCount > 0 || placedCount === 0}
          className={`${primaryButton} py-3`}
        >
          Save Start List…
        </button>
      </div>
    </section>
  );
}
