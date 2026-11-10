import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DAL_PANTH_API, DAL_PANTH_MAX_LENGTH } from "../../lib/dal-panth.ts";

const repoFile = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

const cell = repoFile("src/app/admin/DalPanthCell.tsx");
const dashboard = repoFile("src/app/admin/AdminDashboard.tsx");

/* The slice of the dashboard between two markers. */
const between = (source: string, start: string, end: string) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from > -1, `${start} is in the source`);
  assert.ok(to > from, `${end} follows ${start}`);
  return source.slice(from, to);
};

test("the cell keeps the props the lists and the check-in card rely on", () => {
  assert.match(cell, /^"use client";/);
  assert.match(cell, /export default function DalPanthCell\(/);
  const props = between(cell, "type DalPanthCellProps = {", "};");
  assert.match(props, /code: string \| null \| undefined;/);
  assert.match(props, /value: string \| null \| undefined;/);
  assert.match(props, /riderName: string;/);
  assert.match(props, /variant\?: "table" \| "card";/);
  assert.match(props, /onSaved\?: \(value: string \| null\) => void;/);
  assert.match(cell, /variant = "table",/);
});

test("the cell saves through the shared Dal Panth route and contract", () => {
  assert.equal(DAL_PANTH_API, "/api/admin/dal-panth");
  assert.equal(DAL_PANTH_MAX_LENGTH, 120);
  assert.match(cell, /from "@\/lib\/dal-panth";/);
  assert.match(cell, /fetch\(DAL_PANTH_API, \{\s+method: "PATCH",/);
  assert.match(cell, /maxLength=\{DAL_PANTH_MAX_LENGTH\}/);
  assert.doesNotMatch(cell, /maxLength=\{\d/);
  // One request, to that route only.
  assert.equal((cell.match(/fetch\(/g) ?? []).length, 1);
  assert.doesNotMatch(cell, /fetch\("/);

  // The body is a DalPanthRequest of exactly two keys, and nothing else is
  // ever stringified into the request.
  assert.match(
    cell,
    /const body: DalPanthRequest = \{ code: riderCode, dal_panth: normalized\.value \};/
  );
  assert.equal((cell.match(/JSON\.stringify\(/g) ?? []).length, 1);
  assert.match(cell, /body: JSON\.stringify\(body\),/);

  // Blank or spaced-out text goes through the same normalising as the route.
  assert.match(cell, /normalizeDalPanth\(draft\)/);
});

test("the cell reports failures and works before the database update", () => {
  assert.match(cell, /role="alert"/);
  // The server's own message first (the "database update needed" text
  // before the migration), then a fallback; a dropped connection has its own.
  assert.match(cell, /typeof result\?\.error === "string"/);
  assert.match(cell, /Could not reach the server\. Check the connection and retry\./);
  assert.match(cell, /\.json\(\)\.catch\(\(\) => \(\{\}\)\)/);

  // A row without the column (or without a code) shows a dash, never throws.
  assert.match(cell, /\{current \?\? "—"\}/);
  assert.match(cell, /typeof value === "string" && value\.trim\(\) !== ""/);
  assert.match(cell, /typeof code === "string" && code\.trim\(\) !== ""/);
  assert.match(cell, /\{riderCode && \(/);
});

test("the cell is usable by keyboard and screen reader", () => {
  assert.match(cell, /event\.key === "Enter"/);
  assert.match(cell, /event\.key === "Escape"/);
  assert.match(cell, /inputRef\.current\?\.focus\(\)/);
  assert.match(cell, /buttonRef\.current\?\.focus\(\)/);
  assert.match(cell, /<label htmlFor=\{inputId\} className="sr-only">/);
  assert.match(cell, /aria-label=\{`\$\{current \? "Edit" : "Add"\} \$\{DAL_PANTH_LABEL\} for \$\{riderName\}`\}/);
  assert.match(cell, /\{saving \? "Saving…" : "Save"\}/);
  assert.match(cell, /disabled=\{saving\}/);
});

test("both lists render the cell after Mother's Name with the row's code", () => {
  const solo = between(dashboard, "filteredSoloRegistrations.map((registration)", "</tbody>");
  const team = between(dashboard, "{members.map((member) => (", "</tbody>");

  for (const [rows, row] of [
    [solo, "registration"],
    [team, "member"],
  ] as const) {
    const cellAt = rows.indexOf("<DalPanthCell");
    assert.ok(cellAt > rows.indexOf(`${row}.mother_name ?? "—"`), `${row}: after Mother's Name`);
    assert.ok(cellAt < rows.indexOf(`${row}.age`), `${row}: before Age`);
    assert.match(
      rows,
      new RegExp(
        `<DalPanthCell\\s+code=\\{${row}\\.confirmation_code\\}\\s+value=\\{${row}\\.dal_panth\\}\\s+riderName=\\{${row}\\.full_name\\}\\s+onSaved=\\{\\(\\) => router\\.refresh\\(\\)\\}`
      )
    );
    // The same cell in normal and edit mode: it is not behind isEditing.
    assert.equal((rows.match(/<DalPanthCell/g) ?? []).length, 1);
  }

  assert.match(dashboard, /import DalPanthCell from "\.\/DalPanthCell";/);

  // Header and colgroup move together in both tables.
  for (const table of [
    between(dashboard, "min-w-[2684px]", "</thead>"),
    between(dashboard, "min-w-[2184px]", "</thead>"),
  ]) {
    const cols = (table.match(/<col className=/g) ?? []).length;
    const headers = (table.match(/<th className=/g) ?? []).length;
    assert.equal(cols, headers);
    assert.match(table, /Mother&apos;s Name<\/th>\s+<th className="whitespace-nowrap px-3 py-2">Dal Panth<\/th>/);
  }
});

test("Dal Panth is never part of a row edit or the registrations payload", () => {
  const fields = between(
    dashboard,
    "const editableRegistrationFields",
    "const dateFormatter"
  );
  assert.doesNotMatch(fields, /dal_panth/);

  for (const [start, end] of [
    ["const startEditingSolo", "const cancelEditingSolo"],
    ["const saveSoloRegistration", "const startDeletingSolo"],
    ["const startEditingTeam", "const cancelEditingTeam"],
    ["const saveTeamRegistration", "const teamMembersByTeamId"],
    ["const requestRegistrationMutation", "function ListSearchBar"],
  ]) {
    assert.doesNotMatch(between(dashboard, start, end), /dal_panth|DalPanth/, start);
  }

  // The only places the dashboard names the column: the two row types,
  // search, and the two cells (set_dal_panth, the audit label, is not one).
  assert.equal((dashboard.match(/(?<!set_)dal_panth/g) ?? []).length, 2 + 2 + 2);
});

test("search matches Dal Panth", () => {
  const matcher = between(dashboard, "const matchesPerson", "const matchesSoloRegistration");
  assert.match(matcher, /"dal_panth"/);
  assert.match(matcher, /\(person\.dal_panth \?\? ""\)\.toLowerCase\(\)\.includes\(query\)/);
});

test("both toolbars carry the Excel export", () => {
  assert.match(dashboard, /import ExportRidersButton from "\.\/ExportRidersButton";/);
  assert.match(dashboard, /action\?: React\.ReactNode;/);
  assert.match(dashboard, /action=\{<ExportRidersButton list="solo" \/>\}/);
  // Teams also carries the link to the printable marksheets beside it.
  assert.match(dashboard, /<Link\s+href=\{MARKSHEET_PATH\}[\s\S]{0,400}?Print marksheets\s+<\/Link>\s+<ExportRidersButton list="teams" \/>/);
  assert.equal((dashboard.match(/<ExportRidersButton /g) ?? []).length, 2);
});

test("the audit log labels both new actions", () => {
  const labels = between(dashboard, "const auditActionLabels", "};");
  assert.match(labels, /set_dal_panth: "Set Dal Panth",/);
  assert.match(labels, /export_riders: "Exported Riders",/);
});

test("the cell's copy names no Dal Panth and uses no em dash but the empty placeholder", () => {
  // The label is a general term; the only value the cell ever shows is the
  // one it was given or saved (e.g. "Example Dal"), never one of its own.
  assert.doesNotMatch(cell, /value=\{"[^"]/);
  assert.equal((cell.match(/—/g) ?? []).length, 1);
  assert.match(cell, /"—"/);
});
