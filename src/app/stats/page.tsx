import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import SeasonViewNav, { type StatsView } from "@/components/stats/SeasonViewNav";
import StatsBrowser from "@/components/stats/StatsBrowser";
import SummaryTiles from "@/components/stats/SummaryTiles";
import {
  formatDate,
  riderRows,
  riderSummary,
  statesOf,
  teamRows,
  teamSummary,
} from "@/lib/stats/compute";
import { SEASONS, loadSeason, resolveSeason } from "@/lib/stats/seasons";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Stats",
  description: `Rider and team statistics from the ${site.title}: runs, points, carry rates, rounds reached and placings.`,
  alternates: { canonical: "/stats" },
};

/* Season and view come from the query string (?season=2026&view=teams) so a
   link opens the same table; everything else is local to StatsBrowser. */
export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const year = resolveSeason(params.season);
  const viewParam = Array.isArray(params.view) ? params.view[0] : params.view;
  const view: StatsView = viewParam === "teams" ? "teams" : "riders";
  const season = loadSeason(year);

  if (!season) {
    // Only reachable if SEASONS lists a year without a file.
    throw new Error(`No stats file for season ${year}`);
  }

  const riders = view === "riders" ? riderRows(season) : null;
  const teams = view === "teams" ? teamRows(season) : null;

  const tiles = riders
    ? (() => {
        const summary = riderSummary(riders);
        return [
          { label: "Riders who rode", value: String(summary.riders) },
          { label: "Runs ridden", value: String(summary.runs) },
          { label: "Pegs carried", value: String(summary.carries) },
          { label: "Reached the Aarhi rounds", value: String(summary.reachedAarhi) },
        ];
      })()
    : (() => {
        const summary = teamSummary(teams!);
        return [
          { label: "Teams", value: String(summary.teams) },
          { label: "Rides", value: String(summary.rides) },
          { label: "Full houses", value: String(summary.fullHouses), note: "A ride of 16 out of 16" },
          {
            label: "Best ride",
            value: summary.best === null ? "–" : String(summary.best),
            note: summary.best === null ? "No ride totals recorded yet" : "Out of 16",
          },
        ];
      })();

  return (
    <>
      <PageHeader
        title="Stats"
        intro={`Results and statistics from the ${site.title}: every rider and team, round by round.`}
      />

      <section className="bg-cream">
        <div className="mx-auto min-w-0 max-w-6xl space-y-6 px-4 py-10 sm:px-6 sm:py-14">
          <SeasonViewNav seasons={SEASONS} season={year} view={view} />

          {season.provisional && (
            <p className="rounded-lg border border-bronze/25 bg-parchment/60 px-4 py-3 text-sm leading-6 text-brown">
              <span className="font-semibold">Provisional.</span> These results are still being
              checked and may change.
            </p>
          )}

          <SummaryTiles
            label={view === "teams" ? "The teams' season in numbers" : "The riders' season in numbers"}
            tiles={tiles}
          />

          {riders ? (
            <StatsBrowser
              key={`${year}-riders`}
              view="riders"
              season={year}
              rows={riders}
              states={statesOf(riders)}
            />
          ) : (
            <StatsBrowser key={`${year}-teams`} view="teams" season={year} rows={teams!} />
          )}

          <div className="space-y-2 border-t border-bronze/15 pt-6 text-sm leading-6 text-brown/80">
            {season.notes.length > 0 && (
              <ul className="space-y-1">
                {season.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}
            <p className="text-brown/65">
              Last updated <time dateTime={season.updated}>{formatDate(season.updated)}</time>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
