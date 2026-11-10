/* The players' marksheet for manual team scoring: the organisers' paper
   backup beside live scoring. One sheet per team, headed with the team's
   name, each rider with their horse and team already filled in, and four
   empty boxes for Round 1 to Round 4. The sheet keeps the paper form's
   twelve rows.

   Organisers only. The sheet carries names, horses, teams and the Dal Panth,
   and no contact details. Dal Panth is staff-only (the site names no
   organisation in public), so this is reachable from /admin alone.

   No imports on purpose, so the tests can load it directly. */

export const MARKSHEET_ROWS_PER_SHEET = 12;

export const MARKSHEET_ROUNDS = [1, 2, 3, 4] as const;

export const MARKSHEET_PATH = "/admin/marksheet";

/* What the page reads for each team rider. */
export const MARKSHEET_SELECT =
  "id, full_name, horse_name, dal_panth, is_leader, created_at, teams(team_name, created_at)";

type MarksheetTeam = { team_name?: string | null; created_at?: string | null };

export type MarksheetSource = {
  id?: string | null;
  full_name?: string | null;
  horse_name?: string | null;
  dal_panth?: string | null;
  is_leader?: boolean | null;
  created_at?: string | null;
  /* PostgREST gives the embedded team as an object (or, for some
     relationships, a one-item array). */
  teams?: MarksheetTeam | MarksheetTeam[] | null;
};

export type MarksheetRow = {
  /* 1 to 12 on its sheet. */
  number: number;
  name: string;
  horse: string;
  team: string;
};

export type MarksheetSheet = {
  key: string;
  /* Printed on the "Team name" line at the top; null leaves the line empty
     to be written in by hand (a blank sheet). */
  team: string | null;
  /* Printed on the "Dal name" line; null leaves it empty to be written in. */
  dal: string | null;
  /* 1-based page of this team's sheets, and how many it has. */
  page: number;
  pages: number;
  /* Always MARKSHEET_ROWS_PER_SHEET long; null is an empty row. */
  rows: Array<MarksheetRow | null>;
};

const text = (value: unknown) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

const time = (value: unknown) => {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
};

const compareText = (first: string, second: string) =>
  first.localeCompare(second, "en", { sensitivity: "base", numeric: true });

const teamOf = (row: MarksheetSource): MarksheetTeam => {
  const team = Array.isArray(row.teams) ? row.teams[0] : row.teams;
  return team ?? {};
};

const emptyRows = (): Array<MarksheetRow | null> =>
  Array.from({ length: MARKSHEET_ROWS_PER_SHEET }, () => null);

/* One sheet with nothing filled in, for a team formed after printing. */
export const blankMarksheet = (key = "blank"): MarksheetSheet => ({
  key,
  team: null,
  dal: null,
  page: 1,
  pages: 1,
  rows: emptyRows(),
});

/* One sheet per team, in printing order: the teams by name (the older team
   first when two share a name). On a sheet the leader comes first, then the
   riders in the order they were entered. The "Dal name" line is filled in
   when every rider on the team who has a Dal Panth has the same one (capitals
   and spacing aside); a team with none, or with two different ones, leaves
   the line empty. A team is four riders, so one page; a longer one would
   continue on numbered sheets. No riders gives no sheets. */
export const buildTeamMarksheets = (rows: readonly MarksheetSource[]): MarksheetSheet[] => {
  const groups = new Map<string, { name: string; created: number; riders: MarksheetSource[] }>();

  for (const row of rows) {
    const team = teamOf(row);
    const name = text(team.team_name);
    const created = time(team.created_at);
    // Two teams may share a name; the moment each was made keeps them apart.
    const key = `${name.toLowerCase()}|${created}`;
    const group = groups.get(key) ?? { name, created, riders: [] };
    group.riders.push(row);
    groups.set(key, group);
  }

  const ordered = [...groups.entries()].sort(
    ([, first], [, second]) =>
      compareText(first.name, second.name) || first.created - second.created
  );

  const sheets: MarksheetSheet[] = [];

  for (const [key, group] of ordered) {
    const riders = [...group.riders].sort(
      (first, second) =>
        Number(Boolean(second.is_leader)) - Number(Boolean(first.is_leader)) ||
        time(first.created_at) - time(second.created_at) ||
        compareText(text(first.full_name), text(second.full_name))
    );

    const dals = new Map<string, string>();

    for (const rider of riders) {
      const dal = text(rider.dal_panth);

      if (dal !== "" && !dals.has(dal.toLowerCase())) {
        dals.set(dal.toLowerCase(), dal);
      }
    }

    const dal = dals.size === 1 ? [...dals.values()][0] : null;
    const pages = Math.ceil(riders.length / MARKSHEET_ROWS_PER_SHEET);

    for (let page = 1; page <= pages; page += 1) {
      const sheetRows = emptyRows();
      const start = (page - 1) * MARKSHEET_ROWS_PER_SHEET;

      riders.slice(start, start + MARKSHEET_ROWS_PER_SHEET).forEach((rider, index) => {
        sheetRows[index] = {
          number: index + 1,
          name: text(rider.full_name),
          horse: text(rider.horse_name),
          team: group.name,
        };
      });

      sheets.push({
        key: `${key}-${page}`,
        team: group.name === "" ? null : group.name,
        dal,
        page,
        pages,
        rows: sheetRows,
      });
    }
  }

  return sheets;
};
