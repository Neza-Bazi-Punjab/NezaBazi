// Counts agree with their nouns on every scoring surface: "1 rider", never
// "1 riders". The helper itself, and the panels that print counts using it.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { plural } from "./format.ts";

const repoFile = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

test("plural agrees a count with its noun", () => {
  assert.equal(plural(1, "rider"), "1 rider");
  assert.equal(plural(2, "rider"), "2 riders");
  assert.equal(plural(0, "team"), "0 teams");
  assert.equal(plural(1, "solo rider"), "1 solo rider");
  assert.equal(plural(12, "recorded result"), "12 recorded results");
  assert.equal(plural(1, "yr"), "1 yr");
  assert.equal(plural(7, "yr"), "7 yrs");
  assert.equal(plural(1, "entry", "entries"), "1 entry");
  assert.equal(plural(3, "entry", "entries"), "3 entries");
  assert.equal(plural(-1, "point"), "-1 points");
});

test("the scoring surfaces print counts through plural, not a hard-coded plural noun", () => {
  const files = [
    "src/app/admin/scoring/ScoringAdmin.tsx",
    "src/app/admin/scoring/PoolSheet.tsx",
    "src/app/commentary/CommentaryPanel.tsx",
    "src/app/live/LiveBoard.tsx",
  ];
  /* A number interpolated straight in front of a plural noun: `${n} riders`,
     `{n} runs`, `{n} {isSection ? "teams" : "riders"}`. "pools of ~N" and
     "pools of about N" are a size, not a count, and stay as they are. */
  const hardCoded =
    /(\$\{[^}]+\}|\{[\w.?]+\})\s*(\{[^}]*"(riders|teams)"[^}]*\}|(riders|teams|runs|results|recorded results|attempts|pools|points|yrs|years)\b)/;

  for (const path of files) {
    const source = repoFile(path);
    assert.match(source, /import \{ plural \} from "@\/lib\/scoring\/format";/, path);

    for (const [index, line] of source.split("\n").entries()) {
      assert.doesNotMatch(line, hardCoded, `${path}:${index + 1}`);
      assert.doesNotMatch(line, /=== 1 \? "" : "s"|=== 1 \? "year" : "years"/, `${path}:${index + 1}`);
    }
  }
});
