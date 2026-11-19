// Registration is for administrators only after the 2026 championship:
// every registration page sends anyone else home, and the team submit route
// refuses them. The footer's "Registration" link is left in place.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { footerQuickLinks } from "../../lib/site.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const pages = [
  "./page.tsx",
  "./paper/page.tsx",
  "./solo/page.tsx",
  "./solo/success/page.tsx",
  "../register-team/page.tsx",
  "../register-team/success/page.tsx",
];

test("the gate sends anyone but an administrator to the home page", () => {
  const gate = read("../../lib/admin/require-admin-page.ts");
  assert.match(gate, /^import "server-only";/);
  assert.match(gate, /const access = await getAdminAccess\(\);/);
  assert.match(gate, /if \(access\.kind !== "admin"\) \{\s*redirect\("\/"\);\s*\}/);
});

test("every registration page checks first, itself", () => {
  for (const path of pages) {
    const source = read(path);
    assert.match(
      source,
      /import \{ requireAdminOrHome \} from "@\/lib\/admin\/require-admin-page";/,
      path
    );
    assert.match(
      source,
      /export default async function \w+\(\) \{\s*\/\/[^\n]*\n\s*await requireAdminOrHome\(\);/,
      `${path} calls the gate before anything else`
    );
  }
});

test("the team submit route refuses anyone but an administrator", () => {
  const route = read("../register-team/submit/route.ts");
  const gate = route.indexOf('if (profile?.role !== "admin") {');
  assert.ok(gate > 0);
  assert.match(route.slice(gate), /^if \(profile\?\.role !== "admin"\) \{\s*return NextResponse\.json\(\s*\{ error: "Registration is closed\." \},\s*\{ status: 403 \}/);
  // Before the request body is read or anything is written.
  assert.ok(gate < route.indexOf("await request.json()"));
  assert.ok(gate < route.indexOf(".insert("));
});

test("the footer keeps its Registration link", () => {
  assert.ok(footerQuickLinks.some((link) => link.href === "/register" && link.label === "Registration"));
});
