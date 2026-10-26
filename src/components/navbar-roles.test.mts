// Source-level checks for the staff links in the navbar: the role is read from
// the signed-in user's own profiles row, guarded with isProfileRole, and turned
// into account items (never tabs) in both the desktop row and the mobile menu.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { PROFILE_ROLES, isProfileRole } from "../lib/scoring/types.ts";
import { navLinks } from "../lib/site.ts";

const source = readFileSync(new URL("./Navbar.tsx", import.meta.url), "utf8");

/* The desktop row is everything before the mobile menu; the mobile menu is
   everything after it. */
const mobileStart = source.indexOf('id="mobile-menu"');
const desktop = source.slice(0, mobileStart);
const mobile = source.slice(mobileStart);

type StaffLink = { href: string; label: string };

/* Evaluates the staffLinksByRole literal from the component, so the mapping
   is checked as data rather than as text. */
const readStaffLinksByRole = () => {
  const match = source.match(
    /const staffLinksByRole: Record<ProfileRole, [^=]+= (\{[\s\S]*?\n\});/
  );
  assert.ok(match, "Navbar.tsx declares staffLinksByRole as a Record<ProfileRole, ...>");

  return JSON.parse(JSON.stringify(vm.runInNewContext(`(${match[1]})`))) as Record<
    string,
    StaffLink[]
  >;
};

/* The hrefs the navbar shows for a raw profiles.role value, using the same
   guard as the component: anything that is not a known role is a player. */
const staffHrefsFor = (value: unknown) =>
  readStaffLinksByRole()[isProfileRole(value) ? value : "player"].map((link) => link.href);

test("the navbar reads the signed-in user's own role from profiles", () => {
  assert.match(source, /^"use client";/);
  assert.match(
    source,
    /import \{ isProfileRole, type ProfileRole \} from "@\/lib\/scoring\/types";/
  );
  assert.match(source, /import \{ createClient \} from "@\/lib\/supabase\/client";/);
  assert.match(
    source,
    /\.from\("profiles"\)\s*\.select\("role"\)\s*\.eq\("id", userId\)\s*\.maybeSingle\(\)/
  );
  assert.match(source, /setRole\(isProfileRole\(profile\?\.role\) \? profile\.role : "player"\);/);
  assert.match(source, /useState<ProfileRole>\("player"\)/);
});

test("each role maps to the staff panels it may open", () => {
  const byRole = readStaffLinksByRole();
  assert.deepEqual(Object.keys(byRole).sort(), [...PROFILE_ROLES].sort());

  assert.deepEqual(byRole.admin, [
    { href: "/admin", label: "Admin" },
    { href: "/judge", label: "Judge Panel" },
    { href: "/commentary", label: "Commentary" },
  ]);
  assert.deepEqual(byRole.judge, [{ href: "/judge", label: "Judge Panel" }]);
  assert.deepEqual(byRole.commentator, [{ href: "/commentary", label: "Commentary" }]);
  assert.deepEqual(byRole.player, []);

  assert.deepEqual(staffHrefsFor("admin"), ["/admin", "/judge", "/commentary"]);
  assert.deepEqual(staffHrefsFor("judge"), ["/judge"]);
  assert.deepEqual(staffHrefsFor("commentator"), ["/commentary"]);
  assert.deepEqual(staffHrefsFor("player"), []);

  // A missing or unexpected role value is never trusted.
  for (const value of [null, undefined, "", "Admin", "superuser", 1, { role: "admin" }]) {
    assert.deepEqual(staffHrefsFor(value), [], `${JSON.stringify(value)} shows no staff links`);
  }
});

test("the role loads without blocking the navbar and clears on sign-out", () => {
  // Only signed-in people see staff links.
  assert.match(source, /const staffLinks = userLabel \? staffLinksByRole\[role\] : \[\];/);

  // The navbar finishes loading before the role is asked for, and nothing
  // waits on the answer.
  assert.match(source, /setAuthLoading\(false\);\s*void loadRole\(user\?\.id \?\? null\);/);
  assert.doesNotMatch(source, /await loadRole/);

  // Every auth state change re-checks the role, outside the auth callback.
  assert.match(
    source,
    /onAuthStateChange\(\(_event, session\) => \{[\s\S]*?const userId = session\?\.user\.id \?\? null;\s*setTimeout\(\(\) => \{\s*void loadRole\(userId\);\s*\}, 0\);/
  );

  // Signing out resets the role to player.
  assert.match(source, /if \(!userId\) \{\s*setRole\("player"\);\s*return;\s*\}/);
});

test("desktop and mobile both list the staff links among the account items", () => {
  assert.equal(desktop.match(/staffLinks\.map\(/g)?.length, 1);
  assert.equal(mobile.match(/staffLinks\.map\(/g)?.length, 1);

  // Desktop: inside the signed-in branch, beside My Account.
  assert.match(
    desktop,
    /userLabel \? \(\s*<div className="flex items-center gap-4">\s*\{staffLinks\.map\(\(link\) => \(\s*<Link\s+key=\{link\.href\}\s+href=\{link\.href\}[\s\S]*?\{link\.label\}\s*<\/Link>\s*\)\)\}\s*<Link\s+href="\/account"/
  );

  // Desktop staff links use exactly the My Account styling.
  const classAfter = (text: string, marker: string) =>
    text.slice(text.indexOf(marker)).match(/className="([^"]+)"/)?.[1];
  const accountClass = classAfter(desktop, 'href="/account"');
  assert.ok(accountClass);
  assert.equal(classAfter(desktop, "staffLinks.map("), accountClass);

  // An administrator's row only fits beside Register Now from xl up, so the
  // button gives way below xl for administrators alone.
  assert.match(source, /const crowded = staffLinks\.length > 1;/);
  assert.match(
    desktop,
    /href="\/register"\s+className=\{`\$\{crowded \? "hidden xl:block " : ""\}rounded-full/
  );

  // Mobile: one equal-tap-area row per staff link, in the signed-in branch,
  // styled like the My Account row, closing the menu on tap.
  const mobileStaff = mobile.match(
    /userLabel \? \(\s*<>\s*\{staffLinks\.map\(\(link, i\) => \(([\s\S]*?)\)\)\}\s*<li[\s\S]*?href="\/account"/
  );
  assert.ok(mobileStaff, "the mobile signed-in branch lists staff links before My Account");
  const row = mobileStaff[1];
  assert.match(row, /<li\s+key=\{link\.href\}\s+className=\{mobileItemClass\}/);
  assert.match(row, /style=\{mobileItemStyle\(navLinks\.length \+ i\)\}/);
  assert.match(row, /href=\{link\.href\}/);
  assert.match(row, /onClick=\{\(\) => setOpen\(false\)\}/);
  assert.match(row, /tabIndex=\{open \? undefined : -1\}/);
  assert.match(row, /className=\{`\$\{mobileRowClass\} text-brown\/80`\}/);
  assert.match(
    mobile,
    /href="\/account"\s+onClick=\{\(\) => setOpen\(false\)\}\s+tabIndex=\{open \? undefined : -1\}\s+className=\{`\$\{mobileRowClass\} text-brown\/80`\}/
  );

  // The rows after the staff links keep the stagger in order.
  assert.match(source, /const accountRowIndex = navLinks\.length \+ staffLinks\.length;/);
  assert.match(mobile, /style=\{mobileItemStyle\(accountRowIndex \+ 2\)\}/);
});

test("the public tabs are untouched: staff links are never tabs", () => {
  assert.deepEqual(
    navLinks.map(({ href, label }) => ({ href, label })),
    [
      { href: "/", label: "Home" },
      { href: "/event", label: "Event" },
      { href: "/rules", label: "Rulebook" },
    ]
  );

  const desktopTabs = desktop.match(
    /<ul className="hidden items-center gap-7 lg:flex">([\s\S]*?)<\/ul>/
  );
  assert.ok(desktopTabs);
  assert.match(desktopTabs[1], /navLinks\.map\(/);
  assert.doesNotMatch(desktopTabs[1], /staffLinks|\/admin|\/judge|\/commentary/);

  const mobileTabs = mobile.match(/\{navLinks\.map\(\(link, i\) => \(([\s\S]*?)\)\)\}/);
  assert.ok(mobileTabs);
  assert.doesNotMatch(mobileTabs[1], /staffLinks|\/admin|\/judge|\/commentary/);
});
