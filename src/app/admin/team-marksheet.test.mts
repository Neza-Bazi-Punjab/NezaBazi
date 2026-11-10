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
  assert.equal(blank.dal, null);
  assert.equal(blank.rows.length, MARKSHEET_ROWS_PER_SHEET);
  assert.ok(blank.rows.every((row) => row === null));
});

test("one sheet per Dal, Dals by name, riders with no Dal last", () => {
  const sheets = buildTeamMarksheets([
    rider("No Dal Rider", "Zed", null),
    rider("Tarna Rider", "Alpha", "Tarna"),
    rider("Budha Rider", "Beta", "Budha"),
    rider("Blank Dal Rider", "Zed", "   "),
  ]);

  assert.deepEqual(
    sheets.map((sheet) => sheet.dal),
    ["Budha", "Tarna", null]
  );
  assert.deepEqual(names(sheets[2].rows), ["Blank Dal Rider", "No Dal Rider"]);
  assert.ok(sheets.every((sheet) => sheet.rows.length === MARKSHEET_ROWS_PER_SHEET));
});

test("a Dal typed with different capitals or spacing is one Dal", () => {
  const sheets = buildTeamMarksheets([
    rider("A", "Team", "Budha Dal"),
    rider("B", "Team", "budha  dal "),
  ]);

  assert.equal(sheets.length, 1);
  assert.equal(sheets[0].dal, "Budha Dal");
  assert.equal(names(sheets[0].rows).length, 2);
});

test("within a Dal: teams by name, the leader first, then the order entered", () => {
  const sheets = buildTeamMarksheets([
    rider("Second entered", "Bravo", "Dal", { created_at: "2026-11-10T10:02:00Z" }),
    rider("Leader", "Bravo", "Dal", { is_leader: true, created_at: "2026-11-10T10:05:00Z" }),
    rider("First entered", "Bravo", "Dal", { created_at: "2026-11-10T10:01:00Z" }),
    rider("Alpha rider", "alpha", "Dal"),
  ]);

  assert.deepEqual(names(sheets[0].rows), [
    "Alpha rider",
    "Leader",
    "First entered",
    "Second entered",
  ]);
  assert.deepEqual(
    sheets[0].rows.slice(0, 4).map((row) => row?.number),
    [1, 2, 3, 4]
  );
  assert.equal(sheets[0].rows[1]?.team, "Bravo");
  assert.equal(sheets[0].rows[1]?.horse, "Leader horse");
});

test("more than twelve riders in a Dal continue on numbered sheets", () => {
  const riders = Array.from({ length: 14 }, (_, index) =>
    rider(`Rider ${String(index + 1).padStart(2, "0")}`, `Team ${Math.floor(index / 4) + 1}`, "Dal", {
      created_at: `2026-11-10T10:${String(index).padStart(2, "0")}:00Z`,
    })
  );
  const sheets = buildTeamMarksheets(riders);

  assert.equal(sheets.length, 2);
  assert.deepEqual(
    sheets.map((sheet) => [sheet.page, sheet.pages]),
    [
      [1, 2],
      [2, 2],
    ]
  );
  assert.equal(names(sheets[0].rows).length, 12);
  assert.deepEqual(names(sheets[1].rows), ["Rider 13", "Rider 14"]);
  assert.equal(sheets[1].rows[0]?.number, 1);
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

  assert.deepEqual(sheets[0].rows[0], { number: 1, name: "Spaced Name", horse: "", team: "The Team" });
});

test("the sheet carries no contact details and the page is administrators only", () => {
  for (const column of ["phone", "email", "age", "location", "emergency", "father", "mother", "confirmation_code"]) {
    assert.ok(!MARKSHEET_SELECT.includes(column), `${column} must not be read`);
  }

  const page = read("./marksheet/page.tsx");
  assert.match(page, /const access = await getAdminAccess\(\);/);
  assert.match(page, /if \(access\.kind !== "admin"\) \{\s+return <AdminAccessMessage/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);

  const sheet = read("./marksheet/TeamMarksheet.tsx");
  assert.match(sheet, /body > \*:not\(\.team-marksheet-print\) \{ display: none !important; \}/);
  assert.match(sheet, /break-after: page/);

  // The lib imports nothing, so this test can load it directly.
  assert.doesNotMatch(read("../../lib/admin/team-marksheet.ts"), /^import /m);
});
