import Link from "next/link";
import { focusRing } from "./styles";

export type StatsView = "riders" | "teams";

/* The query string that opens a season and view, e.g. ?season=2026&view=teams.
   The riders view is the default, so it is left out of the link. */
export function statsHref(season: number, view: StatsView): string {
  return view === "teams" ? `/stats?season=${season}&view=teams` : `/stats?season=${season}`;
}

const pill = (active: boolean) =>
  `inline-flex min-h-11 items-center rounded-lg border px-4 font-display text-sm font-semibold uppercase tracking-[0.12em] transition-colors ${focusRing} ${
    active
      ? "border-bronze-deep bg-bronze-deep text-cream"
      : "border-brown/25 bg-cream text-brown hover:border-bronze"
  }`;

/* Season pills and the Riders / Teams switch. Both are links, so the page
   they open can be shared or bookmarked. */
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
    <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
      <nav aria-label="Season">
        <p className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-brown/70">
          Season
        </p>
        <ul className="flex flex-wrap gap-2">
          {seasons.map((year) => (
            <li key={year}>
              <Link
                href={statsHref(year, view)}
                scroll={false}
                aria-current={year === season ? "page" : undefined}
                className={pill(year === season)}
              >
                {year}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <nav aria-label="View">
        <p className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-brown/70">
          View
        </p>
        <ul className="flex flex-wrap gap-2">
          {(
            [
              ["riders", "Riders"],
              ["teams", "Teams"],
            ] as const
          ).map(([id, label]) => (
            <li key={id}>
              <Link
                href={statsHref(season, id)}
                scroll={false}
                aria-current={id === view ? "page" : undefined}
                className={pill(id === view)}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
