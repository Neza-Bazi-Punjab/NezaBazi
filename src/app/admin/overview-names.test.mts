import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const overview = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("the Overview's recent activity shows each admin's current name, not the one saved at the time", () => {
  assert.match(overview, /select\("id, created_at, actor_id, actor_name,/);
  assert.match(overview, /auth\.getUserById\(id\)/);
  assert.match(overview, /user_metadata\?\.full_name/);
  assert.match(
    overview,
    /\(entry\.actor_id && actorNames\.get\(entry\.actor_id\)\) \|\| entry\.actor_name \|\| "—"/
  );
});
