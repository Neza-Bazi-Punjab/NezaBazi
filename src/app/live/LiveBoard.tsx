"use client";

/* The public live scoreboard. Mobile first: spectators and riders follow it
   on their phones at the ground and at home. Reads only the public live
   state (and, for earlier rounds, the public standings view) — run
   snapshots, nothing from a registration. */
import { useMemo, useState } from "react";
import ConnectionBadge from "@/components/scoring/ConnectionBadge";
import LeaderboardTable from "@/components/scoring/LeaderboardTable";
import NotConfiguredNotice from "@/components/scoring/NotConfiguredNotice";
import OnCourseCard from "@/components/scoring/OnCourseCard";
import PoolRoster from "@/components/scoring/PoolRoster";
import ResultFlash from "@/components/scoring/ResultFlash";
import UpNextList from "@/components/scoring/UpNextList";
import {
  LIVE_STATE_URL,
  eventTypeName,
  normalizePublicState,
  nowAndNextPools,
  nowNextText,
  rosterFor,
} from "@/components/scoring/format";
import { plural } from "@/lib/scoring/format";
import type { PodiumEntry, PublicLiveState, ScoringRound } from "@/lib/scoring/types";
import { useLiveState } from "@/lib/scoring/use-live-state";
import { site } from "@/lib/site";
import { useRoundStandings } from "./use-round-standings";

const PLACE_TEXT: Record<PodiumEntry["place"], string> = { 1: "1st", 2: "2nd", 3: "3rd" };

const sectionTitle =
  "font-display text-sm font-semibold uppercase tracking-[0.2em] text-bronze-dark";

function Podium({ round }: { round: ScoringRound }) {
  const podium = Array.isArray(round.podium)
    ? [...round.podium].sort((a, b) => a.place - b.place)
    : [];

  if (podium.length === 0) {
    return null;
  }

  return (
    <ol className="mb-4 grid gap-2 sm:grid-cols-3">
      {podium.map((entry) => (
        <li
          key={`${entry.place}-${entry.entrant_key}`}
          className={`rounded-xl border px-4 py-3 ${
            entry.place === 1 ? "border-bronze bg-bronze text-cream" : "border-bronze/30 bg-cream"
          }`}
        >
          <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] opacity-80">
            {PLACE_TEXT[entry.place] ?? entry.place}
          </p>
          <p className="font-display text-lg font-bold uppercase leading-tight">{entry.name}</p>
        </li>
      ))}
    </ol>
  );
}

export default function LiveBoard() {
  const { data, error, connection, lastUpdated } = useLiveState<PublicLiveState>(LIVE_STATE_URL);
  const state = useMemo(() => normalizePublicState(data), [data]);
  const [tab, setTab] = useState<"standings" | "pools">("standings");
  const [chosenRoundId, setChosenRoundId] = useState<string | null>(null);
  /* undefined: follow the pool that is riding; null: whole round. */
  const [chosenPool, setChosenPool] = useState<string | null | undefined>(undefined);
  const [search, setSearch] = useState("");
  /* "rider" mode collapses the standings; a visitor can still open them. */
  const [standingsOpen, setStandingsOpen] = useState(false);

  const live = state?.live ?? null;
  /* "leaderboard": standings first. "rider": the rider on course alone. The
     other modes keep the normal layout ("blank" and "message" only change
     the stream graphics). */
  const mode = live?.display_mode ?? "scoreboard";
  const round = state?.current_round ?? null;
  const { riding, next } = state
    ? nowAndNextPools(state)
    : { riding: null as string | null, next: null as string | null };
  const nowNext = nowNextText(riding, next);
  const poolCall =
    live?.display_mode === "pool_call" && live.called_pool_label ? live.called_pool_label : null;

  /* Standings: the live round plus every completed one. */
  const roundOptions = (state?.rounds ?? []).filter(
    (option) => option.id === round?.id || option.status === "complete"
  );
  const selectedRound =
    roundOptions.find((option) => option.id === chosenRoundId) ??
    round ??
    roundOptions[roundOptions.length - 1] ??
    null;
  const isCurrentRound = selectedRound !== null && selectedRound.id === round?.id;
  const earlier = useRoundStandings(selectedRound && !isCurrentRound ? selectedRound.id : null);
  const standingsRows = isCurrentRound ? (state?.leaderboard ?? []) : (earlier.rows ?? []);
  const standingsPools = isCurrentRound
    ? (state?.pools ?? [])
    : [...new Set(standingsRows.map((row) => row.pool_label).filter((label): label is string => !!label))].sort(
        (a, b) => a.length - b.length || a.localeCompare(b)
      );
  const followPool = isCurrentRound ? riding : null;
  const tablePool = chosenPool === undefined ? followPool : chosenPool;

  /* Pools tab: every pool of the live round (unpooled rounds use ""). */
  const rosterLabels = state
    ? state.pools.length > 0
      ? state.pools
      : rosterFor(state.pool_rosters, "").length > 0
        ? [""]
        : []
    : [];

  const standingsSection = state ? (
    <section aria-label="Standings and pools">
      <div role="group" aria-label="Show" className="grid grid-cols-2 gap-2">
        {(["standings", "pools"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={tab === option}
            onClick={() => setTab(option)}
            className={`min-h-12 rounded-xl border font-display text-sm font-semibold uppercase tracking-[0.15em] transition-colors ${
              tab === option
                ? "border-bronze-deep bg-bronze-deep text-cream"
                : "border-brown/25 text-brown hover:border-bronze"
            }`}
          >
            {option === "standings" ? "Standings" : "Pools"}
          </button>
        ))}
      </div>

      {tab === "standings" ? (
        <div className="mt-5">
          {selectedRound ? (
            <>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-brown">
                    {selectedRound.name}
                  </h2>
                  <p className="text-sm text-brown/75">
                    {[
                      eventTypeName(selectedRound.event_type),
                      selectedRound.target_points
                        ? `Target ${plural(selectedRound.target_points, "point")}`
                        : null,
                      isCurrentRound ? "Live" : "Final standings",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {roundOptions.length > 1 && (
                  <label className="flex items-center gap-2 text-sm text-brown">
                    <span className="font-display font-semibold uppercase tracking-[0.12em]">
                      Round
                    </span>
                    <select
                      value={selectedRound.id}
                      onChange={(event) => {
                        setChosenRoundId(event.target.value);
                        setChosenPool(undefined);
                      }}
                      className="min-h-11 rounded-lg border border-brown/30 bg-cream px-3 text-ink"
                    >
                      {roundOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                          {option.id === round?.id ? " (live)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              {/* A set podium means the round is decided: shown for the live round too. */}
              <Podium round={selectedRound} />

              {!isCurrentRound && earlier.loading ? (
                <p className="py-6 text-center text-brown/75">Loading standings…</p>
              ) : !isCurrentRound && earlier.error ? (
                <p className="rounded-xl border border-bronze/20 bg-cream px-4 py-6 text-center text-brown/85">
                  {earlier.error}
                </p>
              ) : (
                <LeaderboardTable
                  key={selectedRound.id}
                  rows={standingsRows}
                  eventType={selectedRound.event_type}
                  pools={standingsPools}
                  pool={tablePool}
                  onPoolChange={setChosenPool}
                  targetPoints={selectedRound.target_points}
                  highlightKey={isCurrentRound ? (state.current_run?.entrant_key ?? null) : null}
                  caption={`${selectedRound.name} standings`}
                  emptyText={
                    isCurrentRound ? "No results yet — standings fill in as riders finish." : "No results recorded for this round."
                  }
                />
              )}
            </>
          ) : (
            <p className="text-brown/75">Standings appear once the first round is drawn.</p>
          )}
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <label className="block">
            <span className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-brown">
              Find your pool
            </span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Type a rider or team name"
              autoComplete="off"
              className="mt-2 min-h-12 w-full rounded-lg border border-bronze/40 bg-cream px-4 text-ink outline-none focus:border-bronze"
            />
          </label>

          {rosterLabels.length === 0 ? (
            <p className="text-brown/75">
              {round
                ? "The start list for this round has not been drawn yet."
                : "Pools appear when the next round is drawn."}
            </p>
          ) : (
            rosterLabels.map((labelKey) => {
              const entries = rosterFor(state.pool_rosters, labelKey);
              const isRiding = labelKey !== "" && labelKey === riding;
              const isCalled = labelKey !== "" && labelKey === live?.called_pool_label;

              return (
                <section
                  key={labelKey || "all"}
                  aria-label={labelKey ? `Pool ${labelKey}` : "Start list"}
                  className={`rounded-2xl border bg-cream p-4 ${
                    isRiding ? "border-bronze" : "border-bronze/20"
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-display text-xl font-bold uppercase tracking-wide text-brown">
                      {labelKey ? `Pool ${labelKey}` : "Start list"}
                    </h3>
                    <p className="font-display text-xs font-semibold uppercase tracking-[0.15em] text-brown/70">
                      {[
                        plural(entries.length, round?.event_type === "section" ? "team" : "rider"),
                        isRiding ? "Riding now" : isCalled ? "Called" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <PoolRoster entries={entries} highlight={search} />
                </section>
              );
            })
          )}
        </div>
      )}
    </section>
  ) : null;

  /* Where the standings go for the display mode. */
  const standingsPlacement =
    mode === "leaderboard" ? null : mode === "rider" && !standingsOpen ? (
      <button
        type="button"
        onClick={() => setStandingsOpen(true)}
        className="min-h-12 w-full rounded-xl border border-brown/25 font-display text-sm font-semibold uppercase tracking-[0.15em] text-brown hover:border-bronze"
      >
        Show standings and pools
      </button>
    ) : (
      standingsSection
    );

  let content: React.ReactNode;

  if (!state) {
    content = error ? (
      <p className="rounded-xl border border-red-800/30 bg-red-50 px-4 py-6 text-center text-red-900">
        Live scores could not be loaded. Retrying…
      </p>
    ) : (
      <p className="py-12 text-center text-brown/75">Loading live scores…</p>
    );
  } else if (!state.configured || (state.rounds.length === 0 && !round)) {
    content = <NotConfiguredNotice />;
  } else {
    content = (
      <div className="space-y-6">
        {live?.message && (
          <p className="rounded-xl border-l-4 border-bronze bg-cream px-4 py-3 font-display text-lg font-semibold uppercase tracking-wide text-bronze-deep">
            {live.message}
          </p>
        )}

        {mode === "leaderboard" && standingsSection}

        {round ? (
          poolCall ? (
            <section
              aria-labelledby="pool-call-title"
              className="rounded-2xl border-2 border-bronze bg-cream p-5 shadow-sm"
            >
              <p className={sectionTitle}>Call-up</p>
              <h2
                id="pool-call-title"
                className="mt-1 font-display text-3xl font-bold uppercase tracking-wide text-ink sm:text-4xl"
              >
                Pool {poolCall} — get ready
              </h2>
              {next && next !== poolCall && (
                <p className="mt-1 font-display text-sm font-semibold uppercase tracking-[0.15em] text-brown/75">
                  Next: Pool {next}
                </p>
              )}
              <PoolRoster entries={rosterFor(state.pool_rosters, poolCall)} className="mt-4" />
            </section>
          ) : (
            <OnCourseCard run={state.current_run} round={round} />
          )
        ) : (
          <p className="rounded-xl border border-bronze/20 bg-cream px-4 py-5 text-brown/85">
            No round is being ridden right now. Results from earlier rounds are below.
          </p>
        )}

        {mode !== "rider" && <ResultFlash run={state.last_scored_run} ready persist />}

        {mode !== "rider" && round && <UpNextList runs={state.up_next} round={round} limit={5} />}

        {standingsPlacement}
      </div>
    );
  }

  return (
    <div className="flex-1 bg-sand">
      <div className="sticky top-[var(--nav-height)] z-40 border-b border-bronze/20 bg-parchment/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
          <p className="min-w-0 font-display text-sm font-semibold uppercase tracking-[0.12em] text-brown">
            {nowNext ?? (round ? round.name : "Live scores")}
          </p>
          <ConnectionBadge connection={connection} lastUpdated={lastUpdated} />
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 pb-16 pt-6">
        <header className="mb-6">
          <h1 className="font-display text-4xl font-bold uppercase tracking-wide text-brown sm:text-5xl">
            Live Scores
          </h1>
          <p className="mt-2 text-brown/80">
            {round
              ? [round.name, eventTypeName(round.event_type)].filter(Boolean).join(" · ")
              : `${site.title} · ${site.eventDate}`}
          </p>
        </header>

        {content}
      </div>
    </div>
  );
}
