"use client";

/* The public live leaderboard, in the same "ledger" look as the judges' and
   commentary panels. Hand-held screens first: spectators and riders follow
   it at the ground and at home. It is the standings first: who is through,
   who is out, who is still riding, with the pools one tap away. A small strip
   above says who is riding and who is up next, so riders know when to get
   ready. Reads only the public live state
   (and, for earlier rounds, the public standings view): run snapshots,
   nothing from a registration. */
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
  roundProgress,
} from "@/components/scoring/format";
import { plural } from "@/lib/scoring/format";
import { RESULT_LABELS, RESULT_POINTS, type PublicLiveState } from "@/lib/scoring/types";
import { useLiveState } from "@/lib/scoring/use-live-state";
import {
  LiveStatusBar,
  Podium,
  Roster,
  Standings,
  UpNext,
  card,
  label,
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

  const live = state?.live ?? null;
  /* The Screens modes (scoreboard, standings, rider, …) only change the
     stream graphics; this page is the leaderboard in every one of them. */
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
  const progress = roundProgress(talliedRows);

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
      <div className="sticky top-[calc(var(--nav-height)+2.25rem)] z-30 -mx-4 bg-[var(--ledger-page)] px-4 py-2">
        <div
          role="group"
          aria-label="Show"
          className="grid grid-cols-2 gap-1 rounded-full bg-[var(--ledger-hair)] p-1"
        >
          {(["standings", "pools"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={tab === option}
              onClick={() => setTab(option)}
              className={`mono min-h-11 rounded-full text-[13px] font-semibold uppercase transition-colors ${
                tab === option
                  ? "bg-[var(--ledger-paper)] text-[var(--ledger-ink)] shadow-[0_1px_2px_rgba(46,29,14,0.18)]"
                  : "text-[var(--ledger-muted)]"
              }`}
            >
              {option === "standings" ? "Leaderboard" : "Pools"}
            </button>
          ))}
        </div>
      </div>

      {tab === "standings" ? (
        <div className="mt-1">
          {selectedRound ? (
            <>
              <div className="mb-1.5 flex items-center justify-between gap-3 px-1">
                <h2 className="min-w-0 break-words text-[19px] font-bold uppercase leading-tight">
                  {selectedRound.name}
                  {selectedRound.target_points ? (
                    <span className={`${label} ml-2 whitespace-nowrap`}>
                      Target {selectedRound.target_points}
                    </span>
                  ) : null}
                </h2>
                {roundOptions.length > 1 && (
                  <label className="shrink-0">
                    <span className="sr-only">Round</span>
                    <select
                      value={selectedRound.id}
                      onChange={(event) => {
                        setChosenRoundId(event.target.value);
                        setChosenPool(undefined);
                      }}
                      className="mono min-h-11 max-w-[44vw] rounded-full bg-[var(--ledger-hair)] px-3 text-[12px] font-semibold uppercase text-[var(--ledger-ink)] sm:max-w-none"
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
                <p className={`${card} px-4 py-6 text-center text-[var(--ledger-muted)]`}>
                  {earlier.error}
                </p>
              ) : (
                <>
                  {/* The round at a glance, on one line: through, out, still
                      riding, and how many runs are done. */}
                  {talliedRows.length > 0 && (
                    <div className="mb-2.5 px-1">
                      <p className="mono flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[12px] font-semibold uppercase">
                        <span className="text-[var(--ledger-green)]">{tally.through} through</span>
                        <span className="text-[var(--ledger-red)]">{tally.out} out</span>
                        <span>
                          {tally.riding} {isCurrentRound ? "riding" : "undecided"}
                        </span>
                        {progress.total > 0 && (
                          <span id="progress-title" className="ml-auto font-normal text-[var(--ledger-muted)]">
                            {progress.scored}/{plural(progress.total, "run")}
                          </span>
                        )}
                      </p>
                      {progress.total > 0 && (
                        <div
                          role="progressbar"
                          aria-labelledby="progress-title"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={progress.percent}
                          className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--ledger-hair)]"
                        >
                          <div
                            className="h-full rounded-full bg-[var(--ledger-ink)]"
                            style={{ width: `${progress.percent}%` }}
                          />
                        </div>
                      )}
                    </div>
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
                    nextKey={isCurrentRound ? (state.up_next[0]?.entrant_key ?? null) : null}
                    caption={`${selectedRound.name} standings`}
                    emptyText={
                      isCurrentRound
                        ? "No results yet. Standings fill in as riders finish."
                        : "No results recorded for this round."
                    }
                  />

                  {/* One line: what the numbers mean. */}
                  <p className={`${label} mt-2 px-1`}>{SCORE_KEY.join(" · ")}</p>
                </>
              )}
            </>
          ) : (
            <p className="text-[var(--ledger-muted)]">Standings appear once the first round is drawn.</p>
          )}
        </div>
      ) : (
        <div className="mt-1 flex flex-col gap-3">
          <label className="block">
            <span className="sr-only">Find your pool</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Find your pool: type a name"
              autoComplete="off"
              className="min-h-11 w-full rounded-full bg-[var(--ledger-hair)] px-4 text-[16px] text-[var(--ledger-ink)] placeholder:text-[var(--ledger-muted)]"
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
                  className={`${card} overflow-hidden`}
                >
                  <div
                    className={`flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--ledger-hair)] px-3 py-1.5 ${
                      isRiding ? "bg-[var(--ledger-pick)]" : ""
                    }`}
                  >
                    <h3 className="text-[17px] font-bold uppercase leading-tight">
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

  let content: React.ReactNode;

  if (!state) {
    content = error ? (
      <p className={`${card} px-4 py-6 text-center text-[var(--ledger-red)]`}>
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
      <div className="flex flex-col gap-3">
        {live?.message && (
          <p className="rounded-2xl bg-[var(--ledger-pick)] px-4 py-2 text-center text-[15px] font-bold uppercase leading-tight">
            {live.message}
          </p>
        )}

        {/* A pool being called is the one thing shown above the standings:
            it is how riders know to get ready. */}
        {round && poolCall && (
          <section
            aria-labelledby="pool-call-title"
            className={`${card} overflow-hidden pb-1 pt-2.5 ring-2 ring-[var(--ledger-bronze)]`}
          >
            <p className="mono px-3.5 text-[11px] uppercase text-[var(--ledger-bronze)]">Call-up</p>
            <h2
              id="pool-call-title"
              className="break-words px-3.5 text-[26px] font-bold uppercase leading-[0.95] sm:text-[36px]"
            >
              Pool {poolCall}: get ready
            </h2>
            {next && next !== poolCall && <p className={`${label} mt-1 px-3.5`}>Next: Pool {next}</p>}
            <Roster entries={callUpRoster(state, poolCall)} className="mt-2" />
          </section>
        )}

        {/* Small, so riders can see when they are up; the leaderboard is
            the page. */}
        {round && !poolCall && <UpNext current={state.current_run} next={state.up_next} />}

        {standingsSection}
      </div>
    );
  }

  return (
    <div className={`${LEDGER_ROOT} flex-1`}>
      <div className="sticky top-[var(--nav-height)] z-40">
        <LiveStatusBar
          text={
            [round ? round.name : "Live scores", nowNext].filter(Boolean).join(" · ")
          }
          connection={connection}
        />
      </div>

      <div className="mx-auto max-w-3xl px-4 pb-10 pt-3">
        <h1 className="sr-only">
          Live Scores
          {round ? `: ${[round.name, eventTypeName(round.event_type)].filter(Boolean).join(", ")}` : ""}
        </h1>

        {content}
      </div>
    </div>
  );
}
