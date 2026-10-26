"use client";

/* The commentators' panel: a laptop or tablet in landscape at the commentary
   table. Who is on course (with everything an announcer needs to introduce
   them), who is next, and how the pool and round stand. Read-only. */
import Link from "next/link";
import { useMemo, useState } from "react";
import ConnectionBadge from "@/components/scoring/ConnectionBadge";
import LeaderboardTable from "@/components/scoring/LeaderboardTable";
import NotConfiguredNotice from "@/components/scoring/NotConfiguredNotice";
import PoolRoster from "@/components/scoring/PoolRoster";
import ResultBadge from "@/components/scoring/ResultBadge";
import { useResultFlash } from "@/components/scoring/ResultFlash";
import {
  attemptTextIfMany,
  eventTypeName,
  normalizeCommentaryState,
  nowAndNextPools,
  nowNextText,
  poolName,
  rosterFor,
  roundProgress,
  runSubtitle,
} from "@/components/scoring/format";
import {
  RESULT_LABELS,
  RESULT_POINTS,
  shortLocation,
  type CommentaryState,
  type DisplayMode,
  type LeaderboardRow,
  type RiderDetail,
  type ScoringRound,
  type ScoringRun,
} from "@/lib/scoring/types";
import { plural } from "@/lib/scoring/format";
import { TRAINING_BANNER, TRAINING_LABEL, type TrainingScope } from "@/lib/scoring/training";
import { useLiveState } from "@/lib/scoring/use-live-state";
import "@/components/scoring/scoring.css";

const COMMENTARY_STATE_URL = "/api/commentary/state";

const DISPLAY_MODE_TEXT: Record<DisplayMode, string> = {
  scoreboard: "Scoreboard",
  leaderboard: "Leaderboard",
  rider: "Rider",
  pool_call: "Pool call-up",
  message: "Message only",
  blank: "Hidden",
};

const label = "font-display text-xs font-semibold uppercase tracking-[0.2em] text-cream/65";

/* Keeps a signed headshot URL steady while the same rider is on course, so a
   refetch (which signs a fresh URL) does not reload the photo every few
   seconds. Swaps to the newest URL if the kept one stops loading. */
function useSteadyUrl(identity: string | null, url: string | null) {
  const [kept, setKept] = useState<{ identity: string | null; url: string | null }>({
    identity,
    url,
  });

  if (kept.identity !== identity || (kept.url === null && url !== null)) {
    setKept({ identity, url });
  }

  const refresh = () => setKept({ identity, url });
  return [kept.identity === identity ? kept.url : url, refresh] as const;
}

function Fact({ term, children, large = false }: { term: string; children: React.ReactNode; large?: boolean }) {
  return (
    <div className="flex items-baseline gap-4">
      <dt className={`${label} w-24 shrink-0`}>{term}</dt>
      <dd className={`min-w-0 break-words ${large ? "text-2xl lg:text-3xl" : "text-xl lg:text-2xl"}`}>
        {children}
      </dd>
    </div>
  );
}

const horseLine = (rider: RiderDetail | null, run: ScoringRun) =>
  [
    rider?.horse_name ?? run.horse_name,
    rider?.horse_breed,
    rider?.horse_age !== null && rider?.horse_age !== undefined ? plural(rider.horse_age, "yr") : null,
  ]
    .filter(Boolean)
    .join(" · ");

function OnCourse({
  run,
  rider,
  round,
  leaderboard,
}: {
  run: ScoringRun;
  rider: RiderDetail | null;
  round: ScoringRound | null;
  leaderboard: LeaderboardRow[];
}) {
  const [headshot, refreshHeadshot] = useSteadyUrl(run.id, rider?.headshot_url ?? null);
  const row = leaderboard.find((entry) => entry.entrant_key === run.entrant_key) ?? null;
  const poolSize = row?.pool_label
    ? leaderboard.filter((entry) => entry.pool_label === row.pool_label).length
    : 0;
  const horse = horseLine(rider, run);
  const location = rider?.location ?? run.rider_location;
  const team = rider?.team_name ?? run.team_name;

  return (
    <div key={run.id} className="nbp-rise-in">
      <p className={label}>
        {[
          "On course now",
          poolName(run.pool_label),
          attemptTextIfMany(run, round),
          `Run ${run.run_order}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      <div className="mt-3 flex flex-col-reverse gap-6 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="break-words font-display text-5xl font-bold uppercase leading-[1.02] tracking-wide md:text-6xl xl:text-7xl">
            {rider?.full_name ?? run.rider_name}
          </h1>

          <dl className="mt-6 space-y-3">
            {rider?.father_name && (
              <Fact term="Father" large>
                {rider.father_name}
              </Fact>
            )}
            {rider?.mother_name && (
              <Fact term="Mother" large>
                {rider.mother_name}
              </Fact>
            )}
            {location && <Fact term="From">{location}</Fact>}
            {rider?.age !== null && rider?.age !== undefined && (
              <Fact term="Age">{rider.age}</Fact>
            )}
            {horse && <Fact term="Horse">{horse}</Fact>}
            {rider?.years_experience !== null && rider?.years_experience !== undefined && (
              <Fact term="Riding">
                {plural(rider.years_experience, "year")}
              </Fact>
            )}
            {team && (
              <Fact term="Team">
                {team}
                {rider?.is_leader && (
                  <span className="ml-3 rounded-full bg-bronze px-3 py-0.5 align-middle font-display text-sm font-semibold uppercase tracking-[0.12em]">
                    Team leader
                  </span>
                )}
              </Fact>
            )}
          </dl>

          {!rider && (
            <p className="mt-4 text-cream/60">
              Full rider details are not available for this run.
            </p>
          )}
        </div>

        {headshot && (
          // Signed Supabase Storage URL; next/image would need the bucket host
          // allow-listed in next.config, which this panel does not own.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={headshot}
            alt={`${rider?.full_name ?? run.rider_name}`}
            onError={refreshHeadshot}
            referrerPolicy="no-referrer"
            className="h-44 w-44 shrink-0 rounded-2xl border-2 border-bronze object-cover lg:h-56 lg:w-56"
          />
        )}
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className={label}>Today</p>
          {rider && rider.today.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {rider.today.map((entry, index) => (
                <li
                  key={`${entry.round_name}-${entry.attempt_number}-${index}`}
                  className="flex items-center gap-2 rounded-xl border border-cream/15 bg-white/5 px-3 py-2"
                >
                  <span className="text-sm text-cream/75">
                    {entry.round_name}
                    {entry.attempt_number > 1 || (round?.attempts_per_rider ?? 1) > 1
                      ? ` · ${entry.attempt_number}`
                      : ""}
                  </span>
                  <ResultBadge result={entry.result} status={entry.status} tone="dark" size="sm" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-cream/70">First run of the day.</p>
          )}
        </div>

        <div className="flex flex-wrap gap-6 lg:justify-end">
          <div>
            <p className={label}>Total today</p>
            <p className="font-display text-4xl font-bold tabular-nums">
              {rider?.total_points_today ?? row?.points ?? 0}
              <span className="ml-1 text-lg text-cream/70">pts</span>
            </p>
          </div>
          {row && (
            <div>
              <p className={label}>Rank</p>
              <p className="font-display text-4xl font-bold tabular-nums">
                {row.rank}
                <span className="ml-1 text-lg text-cream/70">of {leaderboard.length}</span>
              </p>
            </div>
          )}
          {row?.pool_label && (
            <div>
              <p className={label}>Pool {row.pool_label} rank</p>
              <p className="font-display text-4xl font-bold tabular-nums">
                {row.pool_rank}
                <span className="ml-1 text-lg text-cream/70">of {poolSize}</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UpNextRider({
  run,
  rider,
  index,
}: {
  run: ScoringRun;
  rider: RiderDetail | null;
  index: number;
}) {
  const parents = [
    rider?.father_name ? `Father: ${rider.father_name}` : null,
    rider?.mother_name ? `Mother: ${rider.mother_name}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const details = [
    runSubtitle(run),
    shortLocation(rider?.location ?? run.rider_location),
    rider?.years_experience !== null && rider?.years_experience !== undefined
      ? `${plural(rider.years_experience, "yr")} riding`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex gap-3 border-t border-cream/10 py-3 first:border-t-0">
      <span className="w-6 shrink-0 font-display text-2xl font-bold text-cream/45">{index + 1}</span>
      <div className="min-w-0">
        <p className="break-words font-display text-2xl font-semibold uppercase leading-tight">
          {rider?.full_name ?? run.rider_name}
        </p>
        {parents && <p className="text-base text-cream/85">{parents}</p>}
        {details && <p className="text-sm text-cream/65">{details}</p>}
      </div>
      {run.pool_label && (
        <span className="ml-auto shrink-0 font-display text-xs font-semibold uppercase tracking-[0.12em] text-cream/55">
          Pool {run.pool_label}
        </span>
      )}
    </li>
  );
}

/* `sample`: training mode (/commentary/demo). Reads a practice session on the
   server (?sample=1) instead of the database — the riders and their
   background are invented — and a banner says so: "shared" on a
   SCORING_SAMPLE_MODE=1 laptop, "personal" for a signed-in staff member on
   the live site, who sees the session their own /judge/demo drives. */
export default function CommentaryPanel({ sample }: { sample?: TrainingScope }) {
  const training = sample !== undefined;
  const stateUrl = training ? `${COMMENTARY_STATE_URL}?sample=1` : COMMENTARY_STATE_URL;
  const { data, error, connection, lastUpdated, refetch } =
    useLiveState<CommentaryState>(stateUrl);
  const state = useMemo(() => normalizeCommentaryState(data), [data]);
  const [standingsMode, setStandingsMode] = useState<"pool" | "round">("pool");
  const [chosenRoundId, setChosenRoundId] = useState<string | null>(null);
  const flashing = useResultFlash(state?.last_scored_run, state !== null);

  const live = state?.live ?? null;
  const round = state?.current_round ?? null;
  const currentRun = state?.current_run ?? null;
  const leaderboard = state?.leaderboard ?? [];
  const pools = state?.pools ?? [];
  const { riding, next } = state
    ? nowAndNextPools(state)
    : { riding: null as string | null, next: null as string | null };
  const nowNext = nowNextText(riding, next);
  const progress = roundProgress(leaderboard);
  const poolCall = live?.display_mode === "pool_call" && live.called_pool_label;
  const standingsPool = currentRun?.pool_label ?? live?.called_pool_label ?? null;
  const showPoolStandings = standingsMode === "pool" && standingsPool !== null;

  /* Up next with full rider detail when the server sent it, otherwise the
     public run snapshot. */
  const upNext: { run: ScoringRun; rider: RiderDetail | null }[] = (
    state && state.up_next_riders.length > 0
      ? state.up_next_riders.map(({ rider, ...run }) => ({ run, rider: rider ?? null }))
      : (state?.up_next ?? []).map((run) => ({ run, rider: null }))
  ).slice(0, 3);

  /* Round standings can look back at any round ridden today. */
  const roundsWithStandings = (state?.rounds ?? []).filter(
    (option) => option.id === round?.id || (state?.leaderboards_by_round[option.id]?.length ?? 0) > 0
  );
  const roundId =
    chosenRoundId && roundsWithStandings.some((option) => option.id === chosenRoundId)
      ? chosenRoundId
      : (round?.id ?? roundsWithStandings[0]?.id ?? null);
  const shownRound = (state?.rounds ?? []).find((option) => option.id === roundId) ?? round;
  const roundRows =
    roundId && roundId !== round?.id
      ? (state?.leaderboards_by_round[roundId] ?? [])
      : leaderboard;

  let left: React.ReactNode;

  if (!state) {
    left = error ? (
      <div className="space-y-4 rounded-2xl border-2 border-red-400/70 bg-red-950/40 p-6">
        <p className="text-xl">{error}</p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={refetch}
            className="min-h-12 rounded-xl border-2 border-cream/40 px-5 font-display font-semibold uppercase tracking-[0.1em]"
          >
            Retry
          </button>
          {!training && (
            <Link
              href="/login?redirect=/commentary"
              className="flex min-h-12 items-center rounded-xl border-2 border-cream/40 px-5 font-display font-semibold uppercase tracking-[0.1em]"
            >
              Log in again
            </Link>
          )}
        </div>
      </div>
    ) : (
      <p className="py-16 text-center text-xl text-cream/70">Loading…</p>
    );
  } else if (!state.configured) {
    left = <NotConfiguredNotice tone="dark" />;
  } else if (poolCall) {
    const called = live.called_pool_label as string;

    left = (
      <section aria-labelledby="pool-call-title" className="nbp-rise-in">
        <p className={label}>{round?.name ?? "Pool call-up"}</p>
        <h1
          id="pool-call-title"
          className="mt-2 font-display text-5xl font-bold uppercase tracking-wide md:text-6xl"
        >
          Pool {called} — get ready
        </h1>
        {next && next !== called && (
          <p className="mt-2 font-display text-2xl font-semibold uppercase tracking-wide text-cream/75">
            Next: Pool {next}
          </p>
        )}
        <PoolRoster
          entries={rosterFor(state.pool_rosters, called)}
          tone="dark"
          size="xl"
          className="mt-8"
        />
      </section>
    );
  } else if (currentRun) {
    left = (
      <OnCourse
        run={currentRun}
        rider={state.current_rider}
        round={round}
        leaderboard={leaderboard}
      />
    );
  } else {
    left = (
      <div>
        <p className={label}>On course now</p>
        <h1 className="mt-3 font-display text-4xl font-bold uppercase">
          {round ? "Waiting for the next rider" : "No round is live"}
        </h1>
        <p className="mt-3 text-xl text-cream/70">
          {round
            ? "The panel switches to the rider as soon as the judges put them on course."
            : "The panel fills in as soon as a round goes live."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-ink text-cream">
      {sample && (
        <p
          role="note"
          className="sticky top-0 z-40 bg-amber-300 px-4 py-2 text-center text-sm font-medium text-ink lg:px-8"
        >
          <span className="mr-2 font-display font-bold uppercase tracking-[0.1em]">
            {TRAINING_LABEL}
          </span>
          {TRAINING_BANNER[sample]}
        </p>
      )}
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-cream/10 px-4 py-3 lg:px-8">
        <p className="font-display text-sm font-bold uppercase tracking-[0.25em] text-bronze">
          Commentary
        </p>
        <p className="min-w-0 font-display text-lg font-semibold uppercase tracking-wide">
          {[round?.name, eventTypeName(round?.event_type)].filter(Boolean).join(" · ") ||
            "No live round"}
        </p>
        {nowNext && (
          <p className="font-display text-lg font-semibold uppercase tracking-wide text-cream/80">
            {nowNext}
          </p>
        )}
        <div className="ml-auto flex items-center gap-3">
          {live && (
            <span className="rounded-full border border-cream/25 px-3 py-1 font-display text-xs font-semibold uppercase tracking-[0.12em] text-cream/80">
              Screens: {DISPLAY_MODE_TEXT[live.display_mode] ?? live.display_mode}
            </span>
          )}
          <ConnectionBadge connection={connection} lastUpdated={lastUpdated} tone="dark" showTime />
        </div>
      </header>

      {state && error && (
        <p className="border-b border-red-400/40 bg-red-950/50 px-4 py-2 text-center lg:px-8">
          {error}
        </p>
      )}

      <div className="grid flex-1 gap-6 p-4 lg:grid-cols-3 lg:gap-8 lg:p-8">
        <main className="space-y-6 lg:col-span-2">
          {flashing && flashing.result && (
            <div
              aria-live="polite"
              className="nbp-flash flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-bronze bg-bronze-deep px-5 py-4"
            >
              <p className="min-w-0 break-words font-display text-3xl font-bold uppercase leading-tight">
                <span className="mr-3 text-base tracking-[0.2em] text-cream/75">Just scored</span>
                {flashing.rider_name}
              </p>
              <span className="font-display text-4xl font-bold uppercase">
                {RESULT_LABELS[flashing.result]} {RESULT_POINTS[flashing.result]}
              </span>
            </div>
          )}
          {left}
        </main>

        <aside className="space-y-8">
          {state?.configured && round && (
            <>
              <section aria-labelledby="up-next-title">
                <h2 id="up-next-title" className={label}>
                  Up next
                </h2>
                {upNext.length === 0 ? (
                  <p className="mt-2 text-cream/70">No more riders waiting in this round.</p>
                ) : (
                  <ol className="mt-1">
                    {upNext.map(({ run, rider }, index) => (
                      <UpNextRider key={run.id} run={run} rider={rider} index={index} />
                    ))}
                  </ol>
                )}
              </section>

              <section aria-labelledby="standings-title">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 id="standings-title" className={label}>
                    Standings
                  </h2>
                  <div role="group" aria-label="Standings view" className="flex gap-1">
                    {(standingsPool ? (["pool", "round"] as const) : (["round"] as const)).map(
                      (mode) => {
                        const active = mode === "pool" ? showPoolStandings : !showPoolStandings;

                        return (
                          <button
                            key={mode}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setStandingsMode(mode)}
                            className={`min-h-11 rounded-lg border px-3 font-display text-sm font-semibold uppercase tracking-[0.1em] ${
                              active
                                ? "border-bronze bg-bronze text-cream"
                                : "border-cream/25 text-cream/80"
                            }`}
                          >
                            {mode === "pool" ? `Pool ${standingsPool}` : "Round"}
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>

                {!showPoolStandings ? (
                  <div className="mt-3 space-y-3">
                    {roundsWithStandings.length > 1 && (
                      <label className="flex items-center gap-3 text-sm text-cream/75">
                        Round
                        <select
                          value={roundId ?? ""}
                          onChange={(event) => setChosenRoundId(event.target.value || null)}
                          className="min-h-11 flex-1 rounded-lg border border-cream/25 bg-ink px-3 text-cream"
                        >
                          {roundsWithStandings.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                              {option.id === round.id ? " (live)" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <LeaderboardTable
                      rows={roundRows}
                      eventType={shownRound?.event_type ?? round.event_type}
                      pools={pools}
                      pool={null}
                      showPoolTabs={false}
                      targetPoints={shownRound?.target_points ?? null}
                      highlightKey={currentRun?.entrant_key ?? null}
                      tone="dark"
                      dense
                      caption={`${shownRound?.name ?? "Round"} standings`}
                    />
                  </div>
                ) : (
                  <LeaderboardTable
                    rows={leaderboard}
                    eventType={round.event_type}
                    pools={pools}
                    pool={standingsPool}
                    showPoolTabs={false}
                    targetPoints={round.target_points}
                    highlightKey={currentRun?.entrant_key ?? null}
                    tone="dark"
                    dense
                    caption={`Pool ${standingsPool} standings`}
                    className="mt-3"
                  />
                )}
              </section>

              <section aria-labelledby="progress-title">
                <div className="flex items-baseline justify-between">
                  <h2 id="progress-title" className={label}>
                    Round progress
                  </h2>
                  <p className="tabular-nums text-cream/80">
                    {progress.scored} of {plural(progress.total, "run")}
                  </p>
                </div>
                <div
                  role="progressbar"
                  aria-labelledby="progress-title"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress.percent}
                  className="mt-2 h-3 overflow-hidden rounded-full bg-white/10"
                >
                  <div
                    className="h-full rounded-full bg-bronze transition-[width] duration-500 motion-reduce:transition-none"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              </section>
            </>
          )}
        </aside>
      </div>

      {/* Practice from home before event day; back again afterwards. */}
      <p className="px-4 pb-6 text-center lg:px-8">
        <Link
          href={training ? "/commentary" : "/commentary/demo"}
          className="inline-flex min-h-11 items-center font-display text-sm font-semibold uppercase tracking-[0.12em] text-cream/60 underline underline-offset-4"
        >
          {training ? "Leave practice — open the live panel" : "Practise on sample riders"}
        </Link>
      </p>

      {live?.message && (
        <footer className="border-t-4 border-bronze bg-bronze-deep px-4 py-3 text-center font-display text-2xl font-semibold uppercase tracking-wide lg:px-8">
          {live.message}
        </footer>
      )}
    </div>
  );
}
