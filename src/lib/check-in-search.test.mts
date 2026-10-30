import assert from "node:assert/strict";
import test from "node:test";

import { matchRank, searchRiders, type SearchableRider } from "./check-in-search.ts";

const rider = (full_name: string, extra: Partial<SearchableRider> = {}): SearchableRider => ({
  full_name,
  email: `${full_name.split(" ")[0].toLowerCase()}@example.com`,
  phone: "+91 98765 43210",
  team_name: null,
  confirmation_code: "NBP-ZZZZZZ",
  ...extra,
});

const arman = rider("Arman Gill", { confirmation_code: "NBP-7K4M2Q" });
const janav = rider("Janav Arora");
const harpreet = rider("Harpreet Singh Sandhu", {
  team_name: "Doaba Riders",
  phone: "+91 99887 74521",
});
const names = (riders: SearchableRider[]) => riders.map((entry) => entry.full_name);

test("one letter matches the start of a name, not a letter inside it", () => {
  assert.equal(matchRank(arman, "a"), 0);
  // Janav's first name only contains an "a"; his surname starts with one, so
  // he is listed, below the names that start with it.
  assert.equal(matchRank(janav, "a"), 1);
  assert.equal(matchRank(rider("Navjot Grewal"), "a"), null);
  assert.deepEqual(names(searchRiders([janav, arman], "a")), ["Arman Gill", "Janav Arora"]);
});

test("a surname, or the start of several words, finds the rider", () => {
  assert.equal(matchRank(harpreet, "sandhu"), 1);
  assert.equal(matchRank(harpreet, "har san"), 1);
  assert.equal(matchRank(harpreet, "harpreet singh"), 0);
  assert.equal(matchRank(harpreet, "andhu"), null);
});

test("email and code match from the start, with or without NBP-", () => {
  assert.equal(matchRank(rider("Gill Arman", { email: "arman@example.com" }), "arman@"), 2);
  assert.equal(matchRank(arman, "7k4m"), 2);
  assert.equal(matchRank(arman, "NBP-7K4"), 2);
  assert.equal(matchRank(arman, "NBP-7K"), null);
  assert.equal(matchRank(arman, "nbp7k4"), 2);
  // One letter never matches on email or code alone, only on names.
  assert.equal(matchRank(rider("Navjot Grewal", { email: "amritsar@example.com", confirmation_code: "NBP-A7K4M2" }), "a"), null);
});

test("a team name word and the last digits of a phone find the rider", () => {
  assert.equal(matchRank(harpreet, "doaba"), 3);
  assert.equal(matchRank(harpreet, "4521"), 4);
  assert.equal(matchRank(harpreet, "45"), null);
});

test("ranking: name start, then word start, then the rest, ties by name", () => {
  const riders = [harpreet, janav, rider("Amandeep Singh"), arman];
  assert.deepEqual(names(searchRiders(riders, "a")), [
    "Amandeep Singh",
    "Arman Gill",
    "Janav Arora",
  ]);
  assert.deepEqual(searchRiders(riders, "   "), []);
});
