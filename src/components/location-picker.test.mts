import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("country and state use searchable comboboxes instead of native selects", () => {
  const picker = readSource("./LocationPicker.tsx");

  assert.doesNotMatch(picker, /<select/);
  assert.ok((picker.match(/<SearchableSelect/g) ?? []).length >= 2);
  assert.match(picker, /role="combobox"/);
  assert.match(picker, /exactMatch\.code !== value/);
});

test("each team rider gets an isolated location picker", () => {
  const teamForm = readSource("../app/register-team/TeamRegisterForm.tsx");

  assert.match(teamForm, /key=\{`rider-location-\$\{index\}`\}/);
});
