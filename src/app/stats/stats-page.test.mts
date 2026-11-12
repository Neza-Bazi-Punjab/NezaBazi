// Source-level checks for /stats: the placeholder is gone, the real season
// file loads and checks out, both views are wired up, and the things the
// phone and accessibility rules depend on stay in place. Counts are never
// hard-coded: the season file is regenerated as more results come in.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { RIDER_GROUPS, TEAM_GROUPS } from "../../lib/stats/columns.ts";
import { riderRows, teamRows } from "../../lib/stats/compute.ts";
import { LATEST_SEASON, SEASONS, loadSeason, resolveSeason } from "../../lib/stats/seasons.ts";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

const statsSources = () => {
  const files = [{ name: "src/app/stats/page.tsx", source: read("./page.tsx") }];
  const base = new URL("../../components/stats/", import.meta.url);
  for (const name of readdirSync(base).filter((file) => /\.tsx?$/.test(file))) {
    files.push({ name: `src/components/stats/${name}`, source: readFileSync(new URL(name, base), "utf8") });
  }
  return files;
};

test("/stats is no longer a coming-soon placeholder", () => {
  const page = read("./page.tsx");
  assert.doesNotMatch(page, /coming soon/i);
  assert.match(page, /<PageHeader/);
  assert.match(page, /title: "Stats"/);
  assert.match(page, /canonical: "\/stats"/);
  assert.doesNotMatch(page, /^"use client"/);
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
  }

  assert.equal(loadSeason(1999), null);
});

test("the season in the query string falls back to the newest season", () => {
  assert.equal(resolveSeason(undefined), LATEST_SEASON);
  assert.equal(resolveSeason("1999"), LATEST_SEASON);
  assert.equal(resolveSeason("abc"), LATEST_SEASON);
  assert.equal(resolveSeason(String(LATEST_SEASON)), LATEST_SEASON);
  assert.equal(resolveSeason([String(LATEST_SEASON), "1999"]), LATEST_SEASON);
});

test("both views are rendered from the query string", () => {
  const page = read("./page.tsx");
  assert.match(page, /await searchParams/);
  assert.match(page, /viewParam === "teams" \? "teams" : "riders"/);
  assert.match(page, /view="riders"/);
  assert.match(page, /view="teams"/);
  assert.match(page, /season\.provisional/);
  assert.match(page, /season\.notes/);
  assert.match(page, /Last updated/);

  const nav = read("../../components/stats/SeasonViewNav.tsx");
  assert.match(nav, /view=teams/);
  assert.match(nav, />\s*\{label\}/);
  assert.match(nav, /\["riders", "Riders"\]/);
  assert.match(nav, /\["teams", "Teams"\]/);
});

test("the table is a real, sortable, accessible table", () => {
  const browser = read("../../components/stats/StatsBrowser.tsx");
  assert.match(browser, /<table/);
  assert.match(browser, /<caption/);
  assert.match(browser, /scope="colgroup"/);
  assert.match(browser, /scope="col"/);
  assert.match(browser, /scope="row"/);
  assert.match(browser, /aria-sort=/);
  assert.match(browser, /tabular-nums/);
  assert.match(browser, /Clear filters/);
  assert.match(browser, /PAGE_SIZES = \[25, 50, 100\]/);
  assert.match(browser, /<Pagination/);

  const popover = read("../../components/stats/Popover.tsx");
  assert.match(popover, /aria-expanded/);
  assert.match(popover, /"Escape"/);
  assert.match(popover, /"pointerdown"/);
});

test("phones: the table scrolls in its own region, rank and name stay put", () => {
  const browser = read("../../components/stats/StatsBrowser.tsx");
  assert.match(browser, /role="region"/);
  // `relative` keeps the screen-reader-only text in off-screen cells inside
  // the scroll region; without it the whole page scrolls sideways on phones.
  assert.match(browser, /role="region"[\s\S]{0,200}className=\{`relative [^`]*overflow-x-auto/);
  assert.match(browser, /sticky left-0/);
  assert.match(browser, /sticky left-12/);
  assert.match(browser, /Scroll the table sideways/);
  assert.match(browser, /hidden sm:table-cell/);

  // Runs and Points by round start off on phones; Columns turns them on.
  const phoneOff = (groups: readonly { id: string; onPhone: boolean }[]) =>
    groups.filter((group) => !group.onPhone).map((group) => group.id);
  assert.deepEqual(phoneOff(RIDER_GROUPS), ["runs", "rounds"]);
  assert.deepEqual(phoneOff(TEAM_GROUPS), ["rounds"]);

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
