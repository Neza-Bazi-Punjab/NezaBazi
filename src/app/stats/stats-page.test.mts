// Source-level checks for /stats: the placeholder is gone, the real season
// file loads and checks out, both views are wired up, and the things the
// phone and accessibility rules depend on stay in place. Counts are never
// hard-coded: the season file is regenerated as more results come in.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { RIDER_COLUMNS, TEAM_COLUMNS } from "../../lib/stats/columns.ts";
import { riderRows, statesOf, teamRows } from "../../lib/stats/compute.ts";
import { legendSections } from "../../lib/stats/legend.ts";
import { LATEST_SEASON, SEASONS, loadSeason, resolveSeason } from "../../lib/stats/seasons.ts";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

/* The four Stats pages (src/app/stats/...) and what each one shows. */
const STATS_PAGES = [
  { file: "./page.tsx", season: "latest", view: "riders" },
  { file: "./teams/page.tsx", season: "latest", view: "teams" },
  { file: "./[season]/page.tsx", season: "param", view: "riders" },
  { file: "./[season]/teams/page.tsx", season: "param", view: "teams" },
] as const;

const statsSources = () => {
  const files = [
    { name: "src/app/stats/StatsSeason.tsx", source: read("./StatsSeason.tsx") },
    ...STATS_PAGES.map(({ file }) => ({ name: `src/app/stats/${file.slice(2)}`, source: read(file) })),
  ];
  const base = new URL("../../components/stats/", import.meta.url);
  for (const name of readdirSync(base).filter((file) => /\.tsx?$/.test(file))) {
    files.push({ name: `src/components/stats/${name}`, source: readFileSync(new URL(name, base), "utf8") });
  }
  return files;
};

test("/stats is no longer a coming-soon placeholder", () => {
  const page = read("./StatsSeason.tsx");
  assert.doesNotMatch(page, /coming soon/i);
  assert.match(page, /<PageTop title="Stats" lead=\{statsLead\(year\)\} \/>/);
  assert.match(page, /Stats from the \$\{SEASON_PLACES\[year\]\} Championship \$\{year\}\./);
  assert.match(page, /2026: "Amritsar"/);
  assert.match(page, /title: "Stats"/);
  // Each page's canonical address is the one its own links use; the newest
  // season's is the plain /stats (statsHref, below).
  assert.match(page, /alternates: \{ canonical: statsHref\(year, view\) \}/);
  for (const file of ["./StatsSeason.tsx", ...STATS_PAGES.map((entry) => entry.file)]) {
    assert.doesNotMatch(read(file), /^"use client"/, file);
  }
});

test("every listed season file loads and passes its checks, newest first", () => {
  assert.ok(SEASONS.length >= 1);
  assert.deepEqual([...SEASONS], [...SEASONS].sort((a, b) => b - a));
  assert.equal(LATEST_SEASON, SEASONS[0]);
  assert.ok(SEASONS.includes(2026));

  for (const year of SEASONS) {
    const season = loadSeason(year);
    assert.ok(season, `season ${year} loads`);
    assert.equal(season.season, year);
    assert.ok(season.riders.length > 0, "the season has riders");
    assert.ok(season.teams.length > 0, "the season has teams");

    const riders = riderRows(season);
    const teams = teamRows(season);
    assert.equal(riders.length, season.riders.length);
    assert.equal(teams.length, season.teams.length);
    assert.equal(riders[0].rank, 1);
    assert.equal(teams[0].rank, 1);
    for (const row of [...riders, ...teams]) {
      assert.ok(Number.isInteger(row.rank) && row.rank >= 1);
    }
    for (const place of [1, 2, 3] as const) {
      assert.ok(riders.filter((row) => row.place === place).length <= 1, `at most one rider placed ${place}`);
      assert.ok(teams.filter((row) => row.place === place).length <= 1, `at most one team placed ${place}`);
    }
    // A placed rider's last ride is the one that decided the place: the Final
    // for 1st and 2nd, the ride-off for 3rd. Reached says which, so second
    // place having fewer points than third reads right.
    for (const row of riders.filter((candidate) => candidate.place !== null)) {
      assert.equal(row.reached, row.place === 3 ? "third" : "final", `${row.name}, placed ${row.place}`);
    }
  }

  assert.equal(loadSeason(1999), null);
});

test("a season value falls back to the newest season", () => {
  assert.equal(resolveSeason(undefined), LATEST_SEASON);
  assert.equal(resolveSeason("1999"), LATEST_SEASON);
  assert.equal(resolveSeason("abc"), LATEST_SEASON);
  assert.equal(resolveSeason(String(LATEST_SEASON)), LATEST_SEASON);
  assert.equal(resolveSeason([String(LATEST_SEASON), "1999"]), LATEST_SEASON);
});

test("both views of every season are pages built at deploy time", () => {
  const page = read("./StatsSeason.tsx");
  assert.match(page, /view="riders"/);
  assert.match(page, /view="teams"/);
  assert.match(page, /season\.provisional/);
  assert.match(page, /season\.notes/);
  // The redesign shows no "Last updated" line.
  assert.doesNotMatch(page, /Last updated/);
  // Every listed season, and nothing else, under its year.
  assert.match(page, /export const seasonParams = \(\) => SEASONS\.map\(\(year\) => \(\{ season: String\(year\) \}\)\);/);
  assert.match(page, /if \(!SEASONS\.includes\(year\)\) \{\s*throw new Error/);

  for (const { file, season, view } of STATS_PAGES) {
    const source = read(file);
    // Nothing that would render the page per request.
    assert.doesNotMatch(source, /searchParams|cookies\(|headers\(|force-dynamic|revalidate/, file);
    if (season === "latest") {
      assert.ok(source.includes(`export const metadata = statsMetadata(LATEST_SEASON, "${view}");`), file);
      assert.ok(source.includes(`<StatsSeason year={LATEST_SEASON} view="${view}" />`), file);
    } else {
      assert.match(source, /export const dynamicParams = false;/, file);
      assert.match(source, /export function generateStaticParams\(\) \{\s*return seasonParams\(\);\s*\}/, file);
      assert.ok(source.includes(`statsMetadata(seasonFromParam((await params).season), "${view}")`), file);
      assert.ok(source.includes(`<StatsSeason year={seasonFromParam((await params).season)} view="${view}" />`), file);
    }
  }
  for (const { source } of statsSources()) {
    assert.doesNotMatch(source, /searchParams|useSearchParams/);
  }

  const nav = read("../../components/stats/SeasonViewNav.tsx");
  assert.match(nav, /const base = season === LATEST_SEASON \? "\/stats" : `\/stats\/\$\{season\}`;/);
  assert.match(nav, /return view === "teams" \? `\$\{base\}\/teams` : base;/);
  assert.match(nav, /href=\{statsHref\(year, view\)\}/);
  assert.match(nav, /href=\{statsHref\(season, id\)\}/);
  assert.doesNotMatch(nav, /\?season=|view=teams/);
  assert.match(nav, />\s*\{label\}/);
  assert.match(nav, /\["riders", "Riders"\]/);
  assert.match(nav, /\["teams", "Teams"\]/);
});

test("old ?season= and ?view= links land on the same table", () => {
  const config = read("../../../next.config.ts");
  // The redirects know every listed season, so a listed ?season= keeps its year
  // and any other falls back to the newest season, as it always did.
  assert.ok(config.includes(`const STATS_SEASON_PATTERN = "(?<season>${SEASONS.join("|")})";`));

  const rules = [
    /source: "\/stats",\s*has: \[\s*\{ type: "query", key: "season", value: STATS_SEASON_PATTERN \},\s*\{ type: "query", key: "view", value: "teams" \},\s*\],\s*destination: "\/stats\/:season\/teams",/,
    /source: "\/stats",\s*has: \[\{ type: "query", key: "season", value: STATS_SEASON_PATTERN \}\],\s*destination: "\/stats\/:season",/,
    /source: "\/stats",\s*has: \[\{ type: "query", key: "view", value: "teams" \}\],\s*destination: "\/stats\/teams",/,
  ];
  // In this order: first match wins.
  const positions = rules.map((rule) => config.search(rule));
  for (const [index, position] of positions.entries()) {
    assert.ok(position > 0, `redirect ${index + 1} is there`);
  }
  assert.deepEqual([...positions], [...positions].sort((a, b) => a - b));
});

test("the table is a real, sortable, accessible table", () => {
  const browser = read("../../components/stats/StatsBrowser.tsx");
  assert.match(browser, /<table/);
  assert.match(browser, /<caption/);
  assert.match(browser, /scope="colgroup"/);
  assert.match(browser, /scope="col"/);
  assert.match(browser, /scope="row"/);
  assert.match(browser, /aria-sort=/);
  assert.match(read("../../components/stats/stats.module.css"), /font-variant-numeric: tabular-nums;/);
  assert.match(browser, /Clear filters/);
  assert.match(browser, /PAGE_SIZE = 25;/);
  assert.match(browser, /<Pagination/);
  // No per-group on/off controls in the redesign: on a computer every group
  // is always there, on a phone too.
  assert.doesNotMatch(browser, /Show these columns|groupSettings/);
  // How the places were decided is said in words, above the table.
  assert.match(browser, /<p className=\{t\.how\}>\s*<b>\{PLACES_DECIDED\[view\]\.lead\}<\/b> \{PLACES_DECIDED\[view\]\.detail\}/);
});

test("fixed column widths and row heights: sorting and paging never move the table", () => {
  const browser = read("../../components/stats/StatsBrowser.tsx");
  const css = read("../../components/stats/stats.module.css");
  assert.match(css, /table-layout: fixed;/);
  assert.match(css, /height: 58px;/);
  assert.match(browser, /<colgroup>/);
  // Every column of both views has its own width.
  for (const column of RIDER_COLUMNS) assert.ok(browser.includes(`${/^[a-z]+$/i.test(column.id) ? column.id : `"${column.id}"`}: `), column.id);
  for (const column of TEAM_COLUMNS) assert.ok(browser.includes(`"${column.id}": `) || browser.includes(`${column.id}: `), column.id);
  // The sort arrow's space is kept on every heading.
  assert.match(css, /\.ar\.off \{\s*visibility: hidden;/);
});

test("phones: the table scrolls in its own region, rank and name stay put", () => {
  const browser = read("../../components/stats/StatsBrowser.tsx");
  assert.match(browser, /role="region"/);
  // `relative` keeps the screen-reader-only text in off-screen cells inside
  // the scroll region; without it the whole page scrolls sideways on phones.
  assert.match(browser, /role="region"[^>]*className=\{t\.scroll\}/);
  const css = read("../../components/stats/stats.module.css");
  assert.match(css, /\.scroll \{\s*position: relative;\s*overflow-x: auto;/);
  // A phone shows the whole table, scrolled sideways under a narrow name cell:
  // no short table and no switch (owner, 19 Nov 2026), nothing hidden.
  assert.doesNotMatch(browser, /onPhone|phHide|allColumns|Summary/);
  assert.doesNotMatch(css, /phHide|\.cols/);
  assert.match(browser, /"--phone-min": `\$\{RANK_WIDTH \+ PHONE_NAME_WIDTH \+ columnsWidth - resultWidth\}px`/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*\.table \{\s*min-width: var\(--phone-min\) !important;/);
  // The place and round reached ride in the name cell, held in place, so the
  // result never scrolls out of view; the Result columns are left out there.
  assert.match(browser, /<span aria-hidden className=\{t\.res\}>/);
  assert.match(css, /\.res,\s*\.swipe \{\s*display: none;\s*\}/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*\.table \.resCol \{\s*display: none;/);
  // The horse and place line stays under the name on a phone too.
  assert.doesNotMatch(css, /\.nm small \{\s*display: none;/);
  assert.match(browser, /Swipe the table sideways/);
  // No rate columns (points per run, carry %, hit %): owner, 19 Nov 2026.
  assert.deepEqual(RIDER_COLUMNS.map((column) => column.id).filter((id) => /rate|perRun/i.test(id)), []);
  // The name stays put while the numbers scroll under it.
  assert.match(css, /\.table \.nm \{\s*position: sticky;\s*left: 0;/);

  // Nothing on the page sets a fixed width wider than a phone.
  for (const { name, source } of statsSources()) {
    assert.doesNotMatch(source, /\bw-screen\b|min-w-\[(?:[4-9]\d{2}|\d{4,})px\]/, `${name} has no wide fixed width`);
  }
});

test("the stats copy names no group and uses no em dashes", () => {
  for (const { name, source } of statsSources()) {
    assert.doesNotMatch(source, /—/, `${name} has no em dash`);
    assert.doesNotMatch(source, /\b(club|sponsor|organi[sz]er|organi[sz]ation|federation|association)\b/i, `${name} names no group`);
  }
});

test("the legend teaches the rules, then the table, for the view on screen", () => {
  const titles = (view: "riders" | "teams") => legendSections(view).map((section) => section.title);
  assert.deepEqual(titles("riders"), ["How points work", "How a rider goes through", "Reading the table"]);
  assert.deepEqual(titles("teams"), ["How points work", "How a team goes through", "Reading the table"]);

  const tableTerms = (view: "riders" | "teams") =>
    legendSections(view)
      .find((section) => section.title === "Reading the table")!
      .terms.map((entry) => entry.term)
      .join(" | ");
  // Every column heading of the view is explained.
  for (const heading of RIDER_COLUMNS.map((column) => column.label)) {
    assert.ok(tableTerms("riders").includes(heading), `riders legend explains ${heading}`);
  }
  for (const heading of TEAM_COLUMNS.map((column) => column.label)) {
    assert.ok(tableTerms("teams").includes(heading), `teams legend explains ${heading}`);
  }
  // The key is on the page, closed until asked for.
  const browser = read("../../components/stats/StatsBrowser.tsx");
  assert.match(browser, /<details className=\{t\.key\}>\s*<summary>Key: /);
  assert.match(browser, /legendSections\(view\)\.map/);
  // Scratched and Out are team marks only; both views explain the dash and a blank.
  assert.match(tableTerms("teams"), /Scratched/);
  assert.match(tableTerms("teams"), /\bOut\b/);
  assert.doesNotMatch(tableTerms("riders"), /Scratched|\bOut\b/);
  for (const view of ["riders", "teams"] as const) {
    assert.match(tableTerms(view), /–/);
    assert.match(tableTerms(view), /Blank/);
    for (const section of legendSections(view)) {
      for (const { term, meaning } of section.terms) {
        assert.doesNotMatch(`${term} ${meaning}`, /—/, `${term}: no em dash`);
        assert.doesNotMatch(`${term} ${meaning}`, /\b(club|sponsor|organi[sz]er|organi[sz]ation)\b/i);
        assert.ok(meaning.length <= 100, `${term}: one short line`);
      }
    }
  }

});

test("the State filter lists only real states, never a country or a single-part place", () => {
  const season = loadSeason(LATEST_SEASON)!;
  const states = statesOf(riderRows(season));
  assert.ok(states.length > 0);
  for (const state of states) {
    assert.doesNotMatch(state, /^(india|canada|pakistan|usa|united states|united kingdom|uk|australia|england)$/i);
  }
  // Every state offered is the last part of some rider's two-part location.
  for (const state of states) {
    assert.ok(
      season.riders.some((rider) => {
        const parts = (rider.location ?? "").split(",").map((part) => part.trim()).filter(Boolean);
        return parts.length >= 2 && parts.at(-1) === state;
      }),
      `${state} comes from a "place, state" location`
    );
  }
});
