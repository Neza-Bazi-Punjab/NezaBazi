# Stats page

Date: 11 Nov 2026. Branch: `feat/stats-page`.

## Goal

Replace the "Coming Soon" placeholder at `/stats` with the season's statistics.
The data is arranged like the reference the owner picked
(https://www.jauhreteg.com/stats), in our own look. Arrange like them, do not
copy their styling.

What the reference does, top to bottom:

1. Title, then a **Season** picker and a **View** switch (Players / Teams).
2. A row of **summary tiles** (one count per division).
3. A toolbar: **Filters**, **Columns**, **Stats Legend**, "Showing 1–25 of 233",
   and a page-size picker (25 / 50 / 100).
4. One wide **sortable table** with grouped column headings (for example
   "Points breakdown"), a name cell with a second line under it, then many
   numeric columns.
5. Numbered **pagination**.

## Data

No database and no API route. A season is one static file,
`src/data/stats/<year>.json`, typed by `src/lib/stats/types.ts` (the contract;
both already exist on this branch and are generated elsewhere, so do not edit
the JSON by hand and do not change the type shapes).

The file holds facts only: each rider's runs with their results, each team
ride's total, and the placings. Everything else is worked out in
`src/lib/stats/compute.ts`, which must be pure and unit-tested.

- Points: carry 4, strike 2, miss 0. An `unknown` run counts as ridden, scores
  0, and is left out of both percentages.
- A team ride with `points: null` counts as a ride and is left out of the
  best ride and the full houses.
- Teams were placed on each round's result, not on a running total, so the
  teams view has no total, average or best column (owner, 11 Nov 2026).

### Round names

The full name is what the legend, the Reached column, the Reached filter and
screen readers use (`SINGLE_STAGE_LABELS` / `TEAM_STAGE_LABELS` in
`compute.ts`); a column heading may use the short form.

| Stage | Full name | Heading |
|---|---|---|
| `qualification` | Qualification | Qual |
| `aarhi1` | Aarhi round 1 | Aarhi 1 |
| `aarhi2` | Aarhi round 2 | Aarhi 2 |
| `final` | Placing ride (one ride for first place or for third place, not a round everyone rode) | Placing |
| `round1` | Round 1 | Round 1 |
| `round2` | Round 2 | Round 2 |
| `third` | 3rd place ride-off | 3rd place |
| `final1` | Final | Final |
| `final2` | Final tie-break (the final finished level, so both teams rode again) | Tie-break |

The legend gives one plain line each for the Placing ride and the Final
tie-break.
- Only 2026 exists. `src/lib/stats/seasons.ts` lists the seasons that have a
  file (newest first) and loads one, so adding a year later is adding a file
  and one line.

### Rider numbers

| Column | Meaning |
|---|---|
| Runs | runs ridden, unknown ones included |
| C / S / M | carries, strikes, misses |
| Qual, Aarhi 1, Aarhi 2, Placing | points in that stage; blank if the rider did not ride it; a dash if they rode it and no result is known |
| Pts | 4 × C + 2 × S |
| Pts/Run | Pts ÷ runs with a known result, 2 decimals |
| Carry % | C ÷ runs with a known result |
| Hit % | (C + S) ÷ runs with a known result |
| Reached | the last stage the rider rode |
| Place | 1st, 2nd, 3rd where set |

Rank (the default order): placed riders first (1, 2, 3); then by the furthest
stage reached; then by points in that stage; then total points; then carry %;
then name. Riders level on all of those share a rank number.

### Team numbers

| Column | Meaning |
|---|---|
| Round 1, Round 2, 3rd place, Final, Tie-break | the ride's total out of 16; blank if not ridden; a dash if ridden and not recorded |
| Reached | the last stage the team rode |
| Place | 1st, 2nd, 3rd where set |

Rank: placed teams first; then furthest stage; then points in that stage; then
name. There is no total-points tie-break (there was no running total), so
teams level on points in their last round share a rank number.

The Reached filter for teams reads "3rd place ride-off or the Final" for that
step, because the ride-off and the Final were ridden side by side.

## Page

Server component `src/app/stats/page.tsx` keeps the existing `PageHeader` and
metadata (update the description: it is no longer "coming soon"), loads the
season, and renders one client component that owns the interaction.

1. **Season and view.** Season pills (only 2026 today, still rendered) and a
   Riders / Teams switch. Both live in the query string (`?season=2026&view=teams`)
   so a link opens the same view; everything else is local state.
2. **Provisional strip** when `season.provisional`: one calm line saying the
   results are still being checked.
3. **Summary tiles**, four per view.
   Riders: riders who rode, runs ridden, pegs carried, riders who reached the
   Aarhi round. Teams: teams, rides, full houses (a 16), best ride.
4. **Toolbar.** A search box (rider, horse or place; team or rider name in the
   team view); **Filters** (riders: Reached, State; teams: Reached); **Columns**
   (switch column groups on and off); **Stats legend** (what C, S, M, Pts/Run,
   Carry %, Hit % and the round headings mean, and how points work); "Showing 1–25 of N riders"; page
   size 25 / 50 / 100.
5. **Table.** A real `<table>` with a caption, two header rows (group, then
   column), `scope` on headers, sortable columns (click toggles descending /
   ascending, `aria-sort` set, a visible indicator), numbers right-aligned in
   tabular figures. The name cell has the horse (riders) or the four riders
   (teams) on a second, quieter line.
6. **Pagination.** Previous, numbered pages, Next. Changing search, filters,
   sort or page size goes back to page 1.
7. **Notes.** `season.notes` under the table, then "Last updated <date>".
8. **Empty states.** No rows after filtering: say so and offer "Clear filters".

### Phones

- The page itself must never scroll sideways at 375px (PR 78 fixed this for
  standings; do not bring it back).
- The table sits in its own horizontally scrollable region with the rank and
  name columns sticky on the left, and a visible hint that it scrolls.
- Riders: fewer column groups are on by default below `sm` (Runs and Points by
  round off); Columns turns them back on. Teams: both groups (Points by round,
  Result) are on, because the round points are the team's whole record.
- Popovers (Filters, Columns, Legend) must be usable by touch and keyboard and
  close on Escape and on outside click.

## Rules that are not negotiable

- **Do not name any club, organisation, sponsor or organiser in any copy you
  write.** Team names come from the data file only. Do not add headings,
  examples or alt text that name a group.
- Do not touch the navbar, `src/lib/site.ts`, `/live`, or any scoring code.
  The Stats tab already exists.
- No new dependencies.
- Keep it simple to read: plain words, no jargon in the interface.

## Files

Owned by this work: `src/app/stats/**`, `src/components/stats/**`,
`src/lib/stats/**` (not `types.ts`'s shapes), and the `test` list in
`package.json`.

## Checks

`npx tsc --noEmit`, `npm run lint`, `npm test` (new test files added to the
`test` script), `npm run build`. Tests to write: `compute.test.mts` (points,
rates with unknown runs, rank order and shared ranks, team totals with a null
ride, sorting helpers) and a page test in the style of the other page tests
that pins the things above that must not regress (no "Coming Soon", the season
file loads, both views present).
