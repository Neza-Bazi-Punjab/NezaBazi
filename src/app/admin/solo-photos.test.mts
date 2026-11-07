import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const repoFile = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

const migration = repoFile("supabase/migrations/20261108100000_paper_rider_headshots.sql");
const uploadRoute = repoFile("src/app/api/admin/headshots/route.ts");
const headshotUrls = repoFile("src/lib/admin/headshot-urls.ts");
const sync = repoFile("src/lib/supabase/sync-registration-profile.ts");
const registrationsRoute = repoFile("src/app/api/admin/registrations/route.ts");
const cell = repoFile("src/app/admin/SoloHeadshotCell.tsx");
const nextConfig = repoFile("next.config.ts");

test("a no-account rider's photo can only point into its own registration's folder", () => {
  assert.match(migration, /add column if not exists headshot_path text/);
  assert.match(migration, /'\^paper\/' \|\| id::text \|\| '\//);
  assert.match(migration, /grant select \(headshot_path\) on public\.solo_registrations to authenticated/);
  assert.doesNotMatch(migration, /grant (insert|update)[^;]*headshot_path/i);
  assert.match(headshotUrls, /export const readPaperHeadshotPath/);
});

test("admins only fill an empty photo slot, and every upload is audited", () => {
  assert.match(uploadRoute, /verifyAdminRequest\(\)/);
  assert.match(uploadRoute, /already has a photo/);
  assert.match(uploadRoute, /\.is\("headshot_path", null\)/);
  assert.equal((uploadRoute.match(/action: "add_headshot"/g) ?? []).length, 2);
  assert.match(uploadRoute, /upsert: false/);
});

test("a claimed paper entry's photo moves onto the rider's account", () => {
  assert.match(sync, /movePaperHeadshotToAccount\(serviceSupabase, userId, row\)/);
  assert.match(sync, /\.copy\(paperPath, accountPath\)/);
  // The account's own photo is never replaced.
  assert.match(sync, /metadata\.headshot_path !== ""\) \{\s*return;/);
});

test("deleting a solo entry removes its registration photo", () => {
  assert.match(registrationsRoute, /operation === "delete_solo"[\s\S]*?readPaperHeadshotPath/);
  assert.match(registrationsRoute, /\.remove\(\[paperHeadshotPath\]\)/);
});

test("the add-photo menu offers files and the camera; photos open in a pop-up", () => {
  assert.match(cell, /Choose from files/);
  assert.match(cell, /Take photo/);
  assert.match(cell, /capture="environment"/);
  assert.match(cell, /getUserMedia/);
  assert.doesNotMatch(cell, /target="_blank"/);
  assert.match(cell, /aria-modal="true"/);
});

test("only admin pages may use the camera", () => {
  assert.match(nextConfig, /value: "camera=\(\), microphone=\(\), geolocation=\(\)"/);
  assert.match(nextConfig, /source: "\/admin\/:path\*",\s*headers: \[\{ key: "Permissions-Policy", value: "camera=\(self\)/);
});

test("admins can delete a photo from the pop-up, after confirming, and it is audited", () => {
  assert.match(cell, /Delete photo/);
  assert.match(cell, /Delete this photo\?/);
  assert.match(cell, /method: "DELETE"/);
  assert.match(uploadRoute, /export async function DELETE/);
  assert.match(uploadRoute, /DELETE[\s\S]*?verifyAdminRequest\(\)/);
  assert.match(uploadRoute, /action: "remove_headshot"/);
  // The audit record is written before anything is removed.
  assert.ok(
    uploadRoute.indexOf('action: "remove_headshot"') <
      uploadRoute.indexOf("headshot_path: null")
  );
});
