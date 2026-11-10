import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MARKSHEET_ROWS_PER_SHEET,
  MARKSHEET_SELECT,
  blankMarksheet,
  buildTeamMarksheets,
  type MarksheetSource,
} from "../../lib/admin/team-marksheet.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const rider = (
  name: string,
  team: string,
  dal: string | null,
  extra: Partial<MarksheetSource> = {}
): MarksheetSource => ({
  full_name: name,
  horse_name: `${name} horse`,
  dal_panth: dal,
  is_leader: false,
  created_at: "2026-11-10T10:00:00Z",
  teams: { team_name: team, created_at: "2026-11-10T09:00:00Z" },
  ...extra,
});

const names = (rows: ReturnType<typeof buildTeamMarksheets>[number]["rows"]) =>
  rows.filter((row) => row !== null).map((row) => row.name);

test("no team riders gives no sheets, and a blank sheet has twelve empty rows", () => {
  assert.deepEqual(buildTeamMarksheets([]), []);

  const blank = blankMarksheet();
  assert.equal(blank.team, null);
  assert.equal(blank.dal, null);
  assert.equal(blank.rows.length, MARKSHEET_ROWS_PER_SHEET);
  assert.ok(blank.rows.every((row) => row === null));
});

test("one sheet per team, headed with its name, teams by name, only its own riders", () => {
  const sheets = buildTeamMarksheets([
    rider("Zed one", "Zed", null),
    rider("Alpha one", "alpha", "Tarna"),
    rider("Zed two", "Zed", null),
    rider("Beta one", "Beta", "Budha"),
  ]);

  assert.deepEqual(
    sheets.map((sheet) => sheet.team),
    ["alpha", "Beta", "Zed"]
  );
  assert.deepEqual(
    sheets.map((sheet) => names(sheet.rows)),
    [["Alpha one"], ["Beta one"], ["Zed one", "Zed two"]]
  );
  assert.equal(sheets[2].rows[1]?.team, "Zed");
  assert.ok(sheets.every((sheet) => sheet.rows.length === MARKSHEET_ROWS_PER_SHEET));
  assert.ok(sheets.every((sheet) => sheet.page === 1 && sheet.pages === 1));
});

test("two teams with the same name get a sheet each, the older first", () => {
  const sheets = buildTeamMarksheets([
    rider("Newer", "Same", null, {
      teams: { team_name: "Same", created_at: "2026-11-10T12:00:00Z" },
    }),
    rider("Older", "same", null, {
      teams: { team_name: "same", created_at: "2026-11-10T08:00:00Z" },
    }),
  ]);

  assert.deepEqual(
    sheets.map((sheet) => names(sheet.rows)),
    [["Older"], ["Newer"]]
  );
  assert.notEqual(sheets[0].key, sheets[1].key);
});

test("the Dal line is filled only when the riders of a team agree on one Dal", () => {
  const sheets = buildTeamMarksheets([
    rider("A1", "Agree", "Budha Dal"),
    rider("A2", "Agree", "budha  dal "),
    rider("A3", "Agree", null),
    rider("M1", "Mixed", "Budha Dal"),
    rider("M2", "Mixed", "Tarna Dal"),
    rider("N1", "None", "   "),
  ]);

  assert.deepEqual(
    sheets.map((sheet) => sheet.dal),
    ["Budha Dal", null, null]
  );
});

test("on a sheet: the leader first, then the order entered", () => {
  const sheets = buildTeamMarksheets([
    rider("Second entered", "Bravo", "Dal", { created_at: "2026-11-10T10:02:00Z" }),
    rider("Leader", "Bravo", "Dal", { is_leader: true, created_at: "2026-11-10T10:05:00Z" }),
    rider("First entered", "Bravo", "Dal", { created_at: "2026-11-10T10:01:00Z" }),
  ]);

  assert.deepEqual(names(sheets[0].rows), ["Leader", "First entered", "Second entered"]);
  assert.deepEqual(
    sheets[0].rows.slice(0, 3).map((row) => row?.number),
    [1, 2, 3]
  );
  assert.equal(sheets[0].rows[0]?.horse, "Leader horse");
});

test("a team of more than twelve riders continues on numbered sheets", () => {
  const riders = Array.from({ length: 14 }, (_, index) =>
    rider(`Rider ${String(index + 1).padStart(2, "0")}`, "Big", "Dal", {
      created_at: `2026-11-10T10:${String(index).padStart(2, "0")}:00Z`,
    })
  );
  const sheets = buildTeamMarksheets(riders);

  assert.deepEqual(
    sheets.map((sheet) => [sheet.page, sheet.pages]),
    [
      [1, 2],
      [2, 2],
    ]
  );
  assert.equal(names(sheets[0].rows).length, 12);
  assert.deepEqual(names(sheets[1].rows), ["Rider 13", "Rider 14"]);
  assert.notEqual(sheets[0].key, sheets[1].key);
});

test("the embedded team may arrive as a one-item array, and text is trimmed", () => {
  const sheets = buildTeamMarksheets([
    {
      full_name: "  Spaced   Name ",
      horse_name: null,
      dal_panth: null,
      teams: [{ team_name: " The  Team " }],
    },
  ]);

  assert.equal(sheets[0].team, "The Team");
  assert.deepEqual(sheets[0].rows[0], {
    number: 1,
    name: "Spaced Name",
    horse: "",
    team: "The Team",
  });
});

test("the sheet carries no contact details and the page is administrators only", () => {
  for (const column of [
    "phone",
    "email",
    "age",
    "location",
    "emergency",
    "father",
    "mother",
    "confirmation_code",
  ]) {
    assert.ok(!MARKSHEET_SELECT.includes(column), `${column} must not be read`);
  }

  const page = read("./marksheet/page.tsx");
  assert.match(page, /const access = await getAdminAccess\(\);/);
  assert.match(page, /if \(access\.kind !== "admin"\) \{\s+return <AdminAccessMessage/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);

  const sheet = read("./marksheet/TeamMarksheet.tsx");
  assert.match(sheet, /body > \*:not\(\.team-marksheet-print\) \{ display: none !important; \}/);
  assert.match(sheet, /break-after: page/);
  // The team's name heads the sheet.
  assert.match(sheet, /ਟੀਮ ਦਾ ਨਾਮ :-/);
  assert.match(sheet, /\{sheet\.team \?\? ""\}/);

  // The lib imports nothing, so this test can load it directly.
  assert.doesNotMatch(read("../../lib/admin/team-marksheet.ts"), /^import /m);
});
