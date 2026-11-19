import Link from "next/link";
import { LATEST_SEASON } from "@/lib/stats/seasons";
import t from "./stats.module.css";

export type StatsView = "riders" | "teams";

/* The page that opens a season and view, e.g. /stats/2026/teams. The newest
   season is the plain /stats (riders) or /stats/teams; the riders view is the
   default, so it is left out of the link. Each is a page built at deploy
   time (src/app/stats/StatsSeason.tsx). */
export function statsHref(season: number, view: StatsView): string {
  const base = season === LATEST_SEASON ? "/stats" : `/stats/${season}`;
  return view === "teams" ? `${base}/teams` : base;
}

/* Season and the Riders / Teams switch. Both are links, so the page they
   open can be shared or bookmarked. */
export default function SeasonViewNav({
  seasons,
  season,
  view,
}: {
  seasons: readonly number[];
  season: number;
  view: StatsView;
}) {
  return (
    <div className={t.switches}>
      <nav aria-label="Season">
        <p className={t.lbl}>Season</p>
        <ul className={t.seg}>
          {seasons.map((year) => (
            <li key={year}>
              <Link href={statsHref(year, view)} scroll={false} aria-current={year === season ? "page" : undefined}>
                {year}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <nav aria-label="View">
        <p className={t.lbl}>View</p>
        <ul className={t.seg}>
          {(
            [
              ["riders", "Riders"],
              ["teams", "Teams"],
            ] as const
          ).map(([id, label]) => (
            <li key={id}>
              <Link href={statsHref(season, id)} scroll={false} aria-current={id === view ? "page" : undefined}>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
