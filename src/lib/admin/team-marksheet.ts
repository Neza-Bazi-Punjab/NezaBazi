/* The players' marksheet for manual team scoring: the organisers' paper
   backup beside live scoring. One sheet per Dal Panth, twelve riders to a
   sheet, each rider with their horse and team already filled in, and four
   empty boxes for Round 1 to Round 4.

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
  /* The Dal Panth printed on the "Dal name" line; null leaves the line empty
     to be written in by hand. */
  dal: string | null;
  /* 1-based page of this Dal's sheets, and how many it has. */
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
  dal: null,
  page: 1,
  pages: 1,
  rows: emptyRows(),
});

/* Sheets in printing order: the Dals by name, then the riders with no Dal
   Panth. Within a Dal the teams go by name (the older team first when two
   share one), and within a team the leader first, then the riders in the
   order they were entered. Two spellings of a Dal that differ only in
   capitals or spacing are one Dal. No riders gives no sheets. */
export const buildTeamMarksheets = (rows: readonly MarksheetSource[]): MarksheetSheet[] => {
  const groups = new Map<string, { dal: string | null; riders: MarksheetSource[] }>();

  for (const row of rows) {
    const dal = text(row.dal_panth);
    const key = dal.toLowerCase();
    const group = groups.get(key) ?? { dal: dal === "" ? null : dal, riders: [] };
    group.riders.push(row);
    groups.set(key, group);
  }

  const ordered = [...groups.entries()].sort(([first], [second]) => {
    if ((first === "") !== (second === "")) {
      return first === "" ? 1 : -1;
    }

    return compareText(first, second);
  });

  const sheets: MarksheetSheet[] = [];

  for (const [key, group] of ordered) {
    const riders = [...group.riders].sort((first, second) => {
      const firstTeam = teamOf(first);
      const secondTeam = teamOf(second);

      return (
        compareText(text(firstTeam.team_name), text(secondTeam.team_name)) ||
        time(firstTeam.created_at) - time(secondTeam.created_at) ||
        Number(Boolean(second.is_leader)) - Number(Boolean(first.is_leader)) ||
        time(first.created_at) - time(second.created_at) ||
        compareText(text(first.full_name), text(second.full_name))
      );
    });

    const pages = Math.ceil(riders.length / MARKSHEET_ROWS_PER_SHEET);

    for (let page = 1; page <= pages; page += 1) {
      const sheetRows = emptyRows();
      const start = (page - 1) * MARKSHEET_ROWS_PER_SHEET;

      riders.slice(start, start + MARKSHEET_ROWS_PER_SHEET).forEach((rider, index) => {
        sheetRows[index] = {
          number: index + 1,
          name: text(rider.full_name),
          horse: text(rider.horse_name),
          team: text(teamOf(rider).team_name),
        };
      });

      sheets.push({
        key: `${key === "" ? "no-dal" : key}-${page}`,
        dal: group.dal,
        page,
        pages,
        rows: sheetRows,
      });
    }
  }

  return sheets;
};
