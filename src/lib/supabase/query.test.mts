import assert from "node:assert/strict";
import test from "node:test";
import { escapeIlikePattern } from "./query.ts";

test("escapes PostgREST's star wildcard in identity values", () => {
  assert.equal(escapeIlikePattern("*@gmail.com"), "\\*@gmail.com");
});
