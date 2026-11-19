import type { Metadata } from "next";
import PageTop from "@/components/redesign/PageTop";
import shared from "@/components/redesign/shared.module.css";
import SeasonViewNav, { statsHref, type StatsView } from "@/components/stats/SeasonViewNav";
import StatsBrowser from "@/components/stats/StatsBrowser";
import SummaryTiles from "@/components/stats/SummaryTiles";
import t from "@/components/stats/stats.module.css";
import {
  riderRows,
  riderSummary,
  statesOf,
  teamRows,
  teamSummary,
} from "@/lib/stats/compute";
import { SEASONS, loadSeason } from "@/lib/stats/seasons";
import { site } from "@/lib/site";

/* The Stats pages, one per season and view, all built at deploy time:
     /stats                  the newest season, riders
     /stats/teams            the newest season, teams
     /stats/<year>           that season, riders
     /stats/<year>/teams     that season, teams
   The newest season can also be opened by its year; its canonical address is
   the short one. Old links with ?season= and ?view= are redirected in
   next.config.ts. Everything else (sorting, filters, pages of the table) is
   local to StatsBrowser. */

export const statsMetadata = (year: number, view: StatsView): Metadata => ({
  title: "Stats",
  description: `Rider and team statistics from the ${site.title}: runs, points, rounds reached and placings.`,
  alternates: { canonical: statsHref(year, view) },
});

/* Where each season's championship was held, for the line under the title.
   Add the place when a new season's file is added. */
const SEASON_PLACES: Record<number, string> = { 2026: "Amritsar" };

export const statsLead = (year: number) =>
  SEASON_PLACES[year]
    ? `Stats from the ${SEASON_PLACES[year]} Championship ${year}.`
    : `Stats from the ${year} championship.`;

/* The [season] segment's values: every listed season, so the newest has a
   page under its year too. */
export const seasonParams = () => SEASONS.map((year) => ({ season: String(year) }));

/* A [season] segment's value as a listed year. Only listed years are built
   (dynamicParams = false), so anything else is a bug. */
export const seasonFromParam = (value: string): number => {
  const year = Number(value);

  if (!SEASONS.includes(year)) {
    throw new Error(`No stats season ${value}`);
  }

  return year;
};

export default function StatsSeason({ year, view }: { year: number; view: StatsView }) {
  const season = loadSeason(year);

  if (!season) {
    // Only reachable if SEASONS lists a year without a file.
    throw new Error(`No stats file for season ${year}`);
  }

  const riders = view === "riders" ? riderRows(season) : null;
  const teams = view === "teams" ? teamRows(season) : null;

  /* Four plain counts a visitor can read at a glance. */
  const tiles = riders
    ? (() => {
        const summary = riderSummary(riders);
        return [
          { label: "Riders", value: String(summary.riders) },
          { label: "Runs ridden", value: String(summary.runs) },
          { label: "Pegs carried", value: String(summary.carries), note: "4 points each" },
          {
            label: "Through qualification",
            value: String(summary.throughQualification),
            note: "Went on to the Aarhi rounds",
          },
        ];
      })()
    : (() => {
        const summary = teamSummary(teams!);
        return [
          { label: "Teams", value: String(summary.teams) },
          { label: "Rides", value: String(summary.rides), note: "Four riders, one peg each" },
          { label: "Through Round 1", value: String(summary.throughRound1), note: "Went on to Round 2" },
          { label: "Full houses", value: String(summary.fullHouses), note: "16 out of 16" },
        ];
      })();

  return (
    <div className={`${shared.page} ${t.stats}`}>
      <PageTop title="Stats" lead={statsLead(year)} />

      <div className={t.body}>
        <div className={t.wide}>
          <SeasonViewNav seasons={SEASONS} season={year} view={view} />

          {season.provisional && (
            <p className={t.prov}>
              <b>Provisional.</b> These results are still being checked and may change.
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

          {season.notes.length > 0 && (
            <ul className={t.notes}>
              {season.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
