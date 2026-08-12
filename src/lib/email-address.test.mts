import assert from "node:assert/strict";
import test from "node:test";
import { MAX_EMAIL_LENGTH, isValidEmail } from "./email-address.ts";

test("accepts the addresses riders actually register with", () => {
  assert.equal(isValidEmail("rider@example.com"), true);
  assert.equal(isValidEmail("first.last@example.co.in"), true);
  assert.equal(isValidEmail("rider+team@example.com"), true);
  assert.equal(isValidEmail("  rider@example.com  "), true);
});

test("rejects malformed addresses", () => {
  assert.equal(isValidEmail(""), false);
  assert.equal(isValidEmail("   "), false);
  assert.equal(isValidEmail(null), false);
  assert.equal(isValidEmail(undefined), false);
  assert.equal(isValidEmail("rider"), false);
  assert.equal(isValidEmail("rider@"), false);
  assert.equal(isValidEmail("@example.com"), false);
  assert.equal(isValidEmail("rider@example"), false);
  assert.equal(isValidEmail("rider@@example.com"), false);
  assert.equal(isValidEmail("rider @example.com"), false);
  assert.equal(isValidEmail("rider@example.com."), false);
});

test("rejects the consecutive-dot domains the old pattern let through", () => {
  assert.equal(isValidEmail("rider@example..com"), false);
  assert.equal(isValidEmail("rider@.example.com"), false);
});

test("enforces the length bound before matching", () => {
  const local = "a".repeat(64);
  assert.equal(isValidEmail(`${local}@example.com`), true);
  assert.equal(isValidEmail(`${"a".repeat(65)}@example.com`), false);

  const oversized = `${"a".repeat(MAX_EMAIL_LENGTH)}@example.com`;
  assert.equal(oversized.length > MAX_EMAIL_LENGTH, true);
  assert.equal(isValidEmail(oversized), false);
});

// Guards the fix for CodeQL js/polynomial-redos. The previous pattern took
// quadratic time on this shape; a regression would blow well past the budget.
test("stays linear on input built to force backtracking", () => {
  const attack = `a@${"a.".repeat(40_000)} `;

  const startedAt = process.hrtime.bigint();
  assert.equal(isValidEmail(attack), false);
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

  assert.ok(
    elapsedMs < 100,
    `validation took ${elapsedMs.toFixed(1)}ms, expected well under 100ms`
  );
});
