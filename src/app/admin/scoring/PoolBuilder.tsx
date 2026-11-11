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
  builderStartOver,
  builderStartPool,
  builderWithOpenLast,
  builderToSave,
  firstOpenAttempt,
  startedPoolLabels,
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

  /* Pools that have started riding are kept exactly as they are on save, so
     they are shown locked. Their letters must not move. */
  const started = useMemo(() => startedPoolLabels(runs), [runs]);
  const isLocked = (index: number) => pooled && started.has(builderPoolLabel(index));
  /* A round with no pools that has started riding cannot be rebuilt. */
  const unpooledStarted = !pooled && runs.some((run) => run.status !== "pending");
  const firstAttempt = firstOpenAttempt(runs);

  /* Starts from the round's current start list, so a drawn list can be
     adjusted rather than rebuilt; a new pool is ready after started ones. */
  const [pools, setPoolsRaw] = useState<BuilderPools>(() =>
    builderWithOpenLast(builderFromRuns(runs), (index) =>
      pooled && startedPoolLabels(runs).has(builderPoolLabel(index))
    )
  );
  const setPools = (next: BuilderPools) => setPoolsRaw(builderWithOpenLast(next, isLocked));
  const [query, setQuery] = useState("");
  /* The pool a tap adds to, by index; null means the last pool. */
  const [active, setActive] = useState<number | null>(null);
  /* The entrant tapped most recently: what "Undo" takes out. */
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  /* With many pools the page is one long list: by default only the pool being
     added to is shown, and the pools that have ridden are left off "Add to". */
  const [showAll, setShowAll] = useState(false);

  /* A change that drops a pool shifts the letters: go back to the last pool
     rather than add to a different pool than the one shown. */
  const update = (next: BuilderPools) => {
    if (next.length < pools.length) {
      setActive(null);
    }

    setPools(next);
  };

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

  const lastIndex = pools.length - 1;
  const currentIndex =
    active !== null && active < pools.length && !isLocked(active) ? active : lastIndex;
  const lockedLabels = pools.map((_, index) => index).filter(isLocked).map(builderPoolLabel);
  const currentLabel = pooled ? builderPoolLabel(currentIndex) : null;
  const currentSize = pools[currentIndex]?.length ?? 0;
  const lastKey = lastAdded !== null && builderHas(pools, lastAdded) ? lastAdded : null;
  const lastPlace = (() => {
    if (!lastKey) {
      return "";
    }

    const index = pools.findIndex((pool) => pool.includes(lastKey));
    const position = pools[index].indexOf(lastKey) + 1;
    return pooled ? `${builderPoolLabel(index)}${position}` : `#${position}`;
  })();
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
            Tap {isTeams ? "teams" : "riders"} in riding order: each goes next in the pool picked under “Add to”.
            {pooled ? " “New pool” starts the next letter." : " This round has no pools: one list."}{" "}
            Nothing changes until you save.
          </p>
          {lockedLabels.length > 0 && (
            <p className="mt-2 rounded-lg border border-bronze/30 bg-parchment px-3 py-2 text-sm leading-6 text-ink">
              {lockedLabels.length === 1 ? `Pool ${lockedLabels[0]} has` : `Pools ${lockedLabels.join(", ")} have`}{" "}
              started riding: kept exactly as is. Add or change the other pools.
              {firstAttempt > 1
                ? ` Round ${firstAttempt - 1} is over, so pools you add now ride from Round ${firstAttempt}.`
                : ""}
            </p>
          )}
          {unpooledStarted && (
            <p className="mt-2 rounded-lg border border-red-700/30 bg-red-50 px-3 py-2 text-sm text-red-800">
              Riding has started and this round has no pools: add riders with Add Late Entrant below.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setPools(builderStartOver(pools, isLocked));
              setActive(null);
              setLastAdded(null);
            }}
            disabled={busy || unpooledStarted || placedCount === 0}
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
          <div className="sticky top-[var(--nav-height)] z-10 space-y-2 rounded-lg border border-bronze/30 bg-parchment px-3 py-2">
            {pooled && (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Add to pool">
                <span className={labelClass}>Add to</span>
                {pools.map((pool, index) => {
                  const selected = index === currentIndex;
                  const locked = isLocked(index);

                  if (locked && !showAll) {
                    return null;
                  }

                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setActive(index === lastIndex ? null : index)}
                      disabled={busy || locked}
                      title={locked ? "Started riding: kept as it is." : undefined}
                      aria-pressed={selected}
                      className={`min-w-[3rem] rounded-lg border px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.08em] transition-colors disabled:opacity-60 ${
                        selected
                          ? "border-bronze-deep bg-bronze-deep text-cream"
                          : "border-bronze/30 bg-cream text-bronze-dark hover:border-bronze/60"
                      }`}
                    >
                      {builderPoolLabel(index)}
                      <span className={`ml-1 font-sans font-normal ${selected ? "text-cream/80" : "text-brown/60"}`}>
                        {pool.length}
                        {locked ? " · riding" : ""}
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setPools(builderStartPool(pools));
                    setActive(null);
                  }}
                  disabled={busy || !builderCanStartPool(pools)}
                  title={builderCanStartPool(pools) ? undefined : "Put someone in the last pool first."}
                  className={primaryButton}
                >
                  + New Pool {builderPoolLabel(lastIndex + 1)}
                </button>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
            <div className="min-w-0" aria-live="polite">
              <p className="text-sm font-semibold text-ink">
                {pooled ? `Adding to Pool ${currentLabel}` : "Adding to the list"} · {currentSize}
                {pooled && round.pool_size ? ` of about ${round.pool_size}` : ""}
              </p>
              {lastKey && (
                <p className="truncate text-xs text-brown/80">
                  Last: {nameOf(lastKey)} ({lastPlace})
                </p>
              )}
            </div>
            {lastKey && (
              <button
                type="button"
                onClick={() => {
                  update(builderRemove(pools, lastKey));
                  setLastAdded(null);
                }}
                disabled={busy}
                aria-label={`Undo: take ${nameOf(lastKey)} out`}
                className={secondaryButton}
              >
                Undo
              </button>
            )}
            </div>
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
                    onClick={() => {
                      setPools(builderAdd(pools, entrant.key, currentIndex));
                      setLastAdded(entrant.key);
                    }}
                    disabled={busy || unpooledStarted}
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
            {pooled && showAll && toSave.length > 0
              ? ` (${toSave.map((pool, index) => `${labels[index]} ${pool.length}`).join(" · ")})`
              : ""}
          </p>

          {pooled && pools.length > 1 && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              aria-pressed={showAll}
              className={secondaryButton}
            >
              {showAll ? `Show Only Pool ${currentLabel}` : `Show All ${pools.length} Pools`}
            </button>
          )}

          {pools.map((pool, poolIndex) => {
            const label = pooled ? builderPoolLabel(poolIndex) : null;
            const isCurrent = poolIndex === currentIndex;
            const locked = isLocked(poolIndex);

            if (pooled && !showAll && !isCurrent) {
              return null;
            }

            return (
              <div
                key={poolIndex}
                className={`rounded-lg border bg-cream ${isCurrent ? "border-bronze" : "border-bronze/20"}`}
              >
                <div className="flex items-center justify-between gap-2 border-b border-bronze/20 bg-parchment px-3 py-2">
                  <p className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink">
                    {label ? `Pool ${label}` : "Start list"} · {pool.length}
                    {isCurrent && pooled ? " · adding here" : ""}
                    {locked ? " · started riding, kept as is" : ""}
                  </p>
                  {pooled && !isCurrent && !locked && (
                    <button
                      type="button"
                      onClick={() => setActive(poolIndex === lastIndex ? null : poolIndex)}
                      disabled={busy}
                      className={smallButton}
                    >
                      Add here
                    </button>
                  )}
                </div>
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
                          {!locked && !unpooledStarted && (
                          <span className="flex items-center gap-1">
                            <button
                              type="button"
                              aria-label={`Move ${name} earlier`}
                              onClick={() => update(builderShift(pools, key, -1))}
                              disabled={busy || position === 0}
                              className={smallButton}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              aria-label={`Move ${name} later`}
                              onClick={() => update(builderShift(pools, key, 1))}
                              disabled={busy || position === pool.length - 1}
                              className={smallButton}
                            >
                              ↓
                            </button>
                            {pooled && pools.some((_, index) => index !== poolIndex && !isLocked(index)) && (
                              <select
                                aria-label={`Move ${name} to another pool`}
                                value=""
                                disabled={busy}
                                onChange={(event) => {
                                  const target = Number(event.target.value);

                                  if (event.target.value !== "" && Number.isInteger(target)) {
                                    update(builderMoveToPool(pools, key, target));
                                  }
                                }}
                                className="rounded-md border border-bronze/20 bg-cream px-1 py-1 text-sm text-brown"
                              >
                                <option value="">Pool…</option>
                                {pools.map((_, index) =>
                                  index === poolIndex || isLocked(index) ? null : (
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
                              onClick={() => update(builderRemove(pools, key))}
                              disabled={busy}
                              className={`${smallButton} text-red-800`}
                            >
                              ✕
                            </button>
                          </span>
                          )}
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
          {lockedLabels.length > 0
            ? `Saving keeps ${lockedLabels.length === 1 ? `Pool ${lockedLabels[0]}` : `Pools ${lockedLabels.join(", ")}`} with ${plural(scoredCount, "result")} and writes the rest.`
            : runs.length > 0
              ? "Saving replaces the current start list."
              : `${plural(round.attempts_per_rider, "attempt")} per ${isTeams ? "team rider" : "rider"}.`}
        </p>
        <button
          type="button"
          onClick={() => onSave(toSave, pooled ? labels : [])}
          disabled={busy || unpooledStarted || placedCount === 0}
          className={`${primaryButton} py-3`}
        >
          Save Start List…
        </button>
      </div>
    </section>
  );
}
