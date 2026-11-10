"use client";

/* The public live scoreboard, in the same "ledger" look as the judges' and
   commentary panels. Hand-held screens first: spectators and riders follow
   it at the ground and at home. Reads only the public live state (and, for
   earlier rounds, the public standings view): run snapshots, nothing from a
   registration. */
import { useMemo, useState } from "react";
import { LEDGER_ROOT } from "@/components/scoring/ledger/Ledger";
import NotConfiguredNotice from "@/components/scoring/NotConfiguredNotice";
import {
  LIVE_STATE_URL,
  eventTypeName,
  normalizePublicState,
  nowAndNextPools,
  nowNextText,
  callUpRoster,
  rosterFor,
} from "@/components/scoring/format";
import { plural } from "@/lib/scoring/format";
import { RESULT_LABELS, RESULT_POINTS, type PublicLiveState } from "@/lib/scoring/types";
import { useLiveState } from "@/lib/scoring/use-live-state";
import { site } from "@/lib/site";
import {
  LastResult,
  LiveStatusBar,
  NextRiders,
  OnCourse,
  Podium,
  Roster,
  Standings,
  label,
  ledgerButton,
} from "./live-parts";
import { useRoundStandings } from "./use-round-standings";

/* How a result scores, in the order a spectator asks: 4, 2, 0. */
const SCORE_KEY = (["carry", "strike", "miss"] as const).map(
  (result) => `${RESULT_POINTS[result]} = ${RESULT_LABELS[result]}`
);

export default function LiveBoard() {
  const { data, error, connection } = useLiveState<PublicLiveState>(LIVE_STATE_URL);
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
  /* Through / out / still to ride, for the pool shown (or the whole round). */
  const shownPool = tablePool !== null && standingsPools.includes(tablePool) ? tablePool : null;
  const talliedRows =
    shownPool === null ? standingsRows : standingsRows.filter((row) => row.pool_label === shownPool);
  const tally = {
    through: talliedRows.filter((row) => row.advanced === true).length,
    out: talliedRows.filter((row) => row.advanced === false).length,
    riding: talliedRows.filter((row) => row.advanced === null).length,
  };

  /* Pools tab: every pool of the live round (unpooled rounds use ""). */
  const rosterLabels = state
    ? state.pools.length > 0
      ? state.pools
      : rosterFor(state.pool_rosters, "").length > 0
        ? [""]
        : []
    : [];

  const standingsSection = state ? (
    <section aria-label="Standings and pools" className="flex flex-col">
      <div role="group" aria-label="Show" className="grid grid-cols-2 gap-1.5">
        {(["standings", "pools"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={tab === option}
            onClick={() => setTab(option)}
            className={ledgerButton(tab === option)}
          >
            {option === "standings" ? "Standings" : "Pools"}
          </button>
        ))}
      </div>

      {tab === "standings" ? (
        <div className="mt-4">
          {selectedRound ? (
            <>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b-[3px] border-[var(--ledger-rule)] pb-2">
                <div className="min-w-0">
                  <h2 className="break-words text-[24px] font-bold uppercase leading-tight">
                    {selectedRound.name}
                  </h2>
                  <p className={label}>
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
                  <label className="flex items-center gap-2">
                    <span className={label}>Round</span>
                    <select
                      value={selectedRound.id}
                      onChange={(event) => {
                        setChosenRoundId(event.target.value);
                        setChosenPool(undefined);
                      }}
                      className="min-h-11 max-w-[60vw] border-2 border-[var(--ledger-ink)] bg-[var(--ledger-panel)] px-2 text-[15px] font-semibold text-[var(--ledger-ink)]"
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
                <p className="py-6 text-center text-[var(--ledger-muted)]">Loading standings…</p>
              ) : !isCurrentRound && earlier.error ? (
                <p className="border border-[var(--ledger-hair)] bg-[var(--ledger-panel)] px-4 py-6 text-center text-[var(--ledger-muted)]">
                  {earlier.error}
                </p>
              ) : (
                <>
                  {/* The round at a glance, in plain words. */}
                  {talliedRows.length > 0 && (
                    <dl className="mb-3 grid grid-cols-3 border-b border-[var(--ledger-rule)] pb-2">
                      {(
                        [
                          ["Through", tally.through, "text-[var(--ledger-green)]"],
                          ["Out", tally.out, "text-[var(--ledger-red)]"],
                          [
                            isCurrentRound ? "Still riding" : "Undecided",
                            tally.riding,
                            "text-[var(--ledger-ink)]",
                          ],
                        ] as const
                      ).map(([term, count, colour]) => (
                        <div key={term} className="flex min-w-0 flex-col-reverse gap-0.5 pr-2">
                          <dt className={`${label} truncate`}>{term}</dt>
                          <dd className={`text-[40px] font-bold leading-[0.9] ${colour}`}>{count}</dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  <Standings
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
                      isCurrentRound
                        ? "No results yet. Standings fill in as riders finish."
                        : "No results recorded for this round."
                    }
                  />

                  {/* One line: what the numbers mean. */}
                  <p className={`${label} mt-3`}>{SCORE_KEY.join(" · ")}</p>
                </>
              )}
            </>
          ) : (
            <p className="text-[var(--ledger-muted)]">Standings appear once the first round is drawn.</p>
          )}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-5">
          <label className="block">
            <span className={label}>Find your pool</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Type a rider or team name"
              autoComplete="off"
              className="mt-1.5 min-h-12 w-full border-2 border-[var(--ledger-ink)] bg-[var(--ledger-panel)] px-3 text-[17px] text-[var(--ledger-ink)] placeholder:text-[var(--ledger-faint)]"
            />
          </label>

          {rosterLabels.length === 0 ? (
            <p className="text-[var(--ledger-muted)]">
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
                  className={isRiding ? "bg-[var(--ledger-hl)]" : ""}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-[3px] border-[var(--ledger-rule)] px-1 pb-1">
                    <h3 className="text-[20px] font-bold uppercase leading-tight">
                      {labelKey ? `Pool ${labelKey}` : "Start list"}
                    </h3>
                    <p
                      className={`mono text-[11px] font-semibold uppercase ${
                        isRiding ? "text-[var(--ledger-bronze)]" : "text-[var(--ledger-muted)]"
                      }`}
                    >
                      {[
                        plural(entries.length, round?.event_type === "section" ? "team" : "rider"),
                        isRiding ? "Riding now" : isCalled ? "Called" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <Roster entries={entries} highlight={search} />
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
        className={`${ledgerButton()} w-full`}
      >
        Show standings and pools
      </button>
    ) : (
      standingsSection
    );

  let content: React.ReactNode;

  if (!state) {
    content = error ? (
      <p className="border-2 border-[var(--ledger-red)] bg-[var(--ledger-panel)] px-4 py-6 text-center text-[var(--ledger-red)]">
        Live scores could not be loaded. Retrying…
      </p>
    ) : (
      <p className="mono py-12 text-center text-[13px] uppercase text-[var(--ledger-muted)]">
        Loading live scores…
      </p>
    );
  } else if (!state.configured || (state.rounds.length === 0 && !round)) {
    content = <NotConfiguredNotice />;
  } else {
    content = (
      <div className="flex flex-col gap-5">
        {live?.message && (
          <p className="border-[3px] border-[var(--ledger-rule)] bg-[var(--ledger-pick)] px-3 py-2 text-center text-[19px] font-bold uppercase leading-tight">
            {live.message}
          </p>
        )}

        {mode === "leaderboard" && standingsSection}

        {round ? (
          poolCall ? (
            <section
              aria-labelledby="pool-call-title"
              className="border-[3px] border-[var(--ledger-bronze)] bg-[var(--ledger-panel)] p-3"
            >
              <p className="mono text-[12px] uppercase text-[var(--ledger-bronze)]">Call-up</p>
              <h2
                id="pool-call-title"
                className="mt-1 break-words text-[36px] font-bold uppercase leading-[0.95] sm:text-[48px]"
              >
                Pool {poolCall}: get ready
              </h2>
              {next && next !== poolCall && <p className={`${label} mt-1`}>Next: Pool {next}</p>}
              <Roster entries={callUpRoster(state, poolCall)} className="mt-3" />
            </section>
          ) : (
            <OnCourse run={state.current_run} round={round} />
          )
        ) : (
          <p className="border border-[var(--ledger-hair)] bg-[var(--ledger-panel)] px-4 py-5 text-[var(--ledger-muted)]">
            No round is being ridden right now. Results from earlier rounds are below.
          </p>
        )}

        {mode !== "rider" && <LastResult run={state.last_scored_run} ready />}

        {mode !== "rider" && round && <NextRiders runs={state.up_next} round={round} limit={5} />}

        {standingsPlacement}
      </div>
    );
  }

  return (
    <div className={`${LEDGER_ROOT} flex-1`}>
      <div className="sticky top-[var(--nav-height)] z-40">
        <LiveStatusBar
          text={nowNext ?? (round ? round.name : "Live scores")}
          connection={connection}
        />
      </div>

      <div className="mx-auto max-w-3xl px-4 pb-16 pt-4">
        <header className="mono mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-[3px] border-[var(--ledger-rule)] pb-2 text-[12px] uppercase">
          <h1 className="font-semibold">Live Scores</h1>
          <p className="text-[var(--ledger-muted)]">
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
