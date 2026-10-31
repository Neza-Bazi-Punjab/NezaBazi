import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./AdminDashboard.tsx", import.meta.url),
  "utf8"
);

test("registration tables contain long values and usable edit fields", () => {
  assert.match(source, /const adminTableInputClass =[\s\S]*?min-w-0/);
  assert.match(source, /function AdminTableText[\s\S]*?truncate/);
  // Two 170px columns each for the parents' names.
  assert.match(source, /min-w-\[2380px\]/);
  assert.match(source, /min-w-\[1880px\]/);
  assert.match(source, /<colgroup>/);

  for (const label of [
    "Horse Name",
    "Emergency Contact",
    "Emergency Phone",
    "Father&apos;s Name",
    "Mother&apos;s Name",
  ]) {
    assert.match(source, new RegExp(`>\\s*${label}\\s*<`));
  }
});

test("the admin menu links one PDF guides page that opens the three guides, and all three PDFs are built", () => {
  const nav = readFileSync(new URL("./AdminNav.tsx", import.meta.url), "utf8");
  assert.match(nav, /\{ href: "\/admin\/guides", label: "PDF guides" \}/);
  assert.doesNotMatch(source, /href="\/documents\//);

  const page = readFileSync(new URL("./guides/page.tsx", import.meta.url), "utf8");

  for (const [href, title] of [
    ["/documents/staff-guide.pdf", "Staff guide"],
    ["/documents/vmix-guide.pdf", "vMix guide"],
    ["/documents/rehearsal-guide.pdf", "Rehearsal guide"],
  ]) {
    assert.match(page, new RegExp(`href: "${href}",\\s+title: "${title}"`));
  }

  // Every guide opens in a new tab, from the one link template, and the page
  // is behind the same administrator gate as the rest of /admin.
  assert.match(page, /href=\{guide\.href\}\s+target="_blank"\s+rel="noopener noreferrer"/);
  assert.match(page, /profile\.role !== "admin"/);

  for (const file of ["staff-guide.pdf", "vmix-guide.pdf", "rehearsal-guide.pdf"]) {
    assert.ok(
      existsSync(new URL(`../../../public/documents/${file}`, import.meta.url)),
      `public/documents/${file} is built (npm run build:guide)`
    );
  }
});

test("every admin section is its own page, in one grouped menu", () => {
  const nav = readFileSync(new URL("./AdminNav.tsx", import.meta.url), "utf8");
  const layout = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");

  // Grouped in the order of the event, each item its own address.
  for (const [href, label] of [
    ["/admin", "Overview"],
    ["/admin/solo", "Solo riders"],
    ["/admin/teams", "Teams"],
    ["/admin/paper", "Paper entry"],
    ["/admin/check-in", "Check-in"],
    ["/admin/scoring", "Scoring"],
    ["/admin/staff", "Staff"],
    ["/admin/audit", "Audit log"],
    ["/admin/guides", "PDF guides"],
  ]) {
    assert.match(nav, new RegExp(`\\{ href: "${href}", label: "${label}" \\}`));
  }
  for (const group of ["Registrations", "Event day", "Staff & records"]) {
    assert.match(nav, new RegExp(`group: "${group}"`));
  }
  assert.match(nav, /aria-current=\{active \? "page" : undefined\}/);

  // The menu is shown to administrators only.
  assert.match(layout, /if \(access\.kind !== "admin"\) \{\s+return children;\s+\}/);

  // The dashboard no longer switches tabs itself: each page names its section,
  // and every section page sits behind the shared administrator gate.
  assert.doesNotMatch(source, /setActiveTab/);
  assert.match(source, /tab: activeTab,/);
  for (const [folder, tab] of [
    ["solo", "solo"],
    ["teams", "team"],
    ["check-in", "checkin"],
    ["staff", "profiles"],
    ["audit", "audit"],
  ]) {
    const page = readFileSync(new URL(`./${folder}/page.tsx`, import.meta.url), "utf8");
    assert.match(page, new RegExp(`tab="${tab}"`), folder);
    assert.match(page, new RegExp(`path="/admin/${folder}"`), folder);
  }
  const section = readFileSync(new URL("./AdminDashboardSection.tsx", import.meta.url), "utf8");
  assert.match(section, /const access = await getAdminAccess\(\);\s+if \(access\.kind !== "admin"\)/);
  const gate = readFileSync(new URL("./admin-access.tsx", import.meta.url), "utf8");
  assert.match(gate, /profile\.role !== "admin"/);
});

test("the admin menu collapses on a laptop and remembers it on this device", () => {
  const nav = readFileSync(new URL("./AdminNav.tsx", import.meta.url), "utf8");
  const layout = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");
  const state = readFileSync(new URL("./admin-nav-state.ts", import.meta.url), "utf8");

  assert.match(nav, /aria-label=\{collapsed \? "Expand menu" : "Collapse menu"\}/);
  assert.match(nav, /aria-expanded=\{!collapsed\}/);
  // A narrow strip with no links when collapsed, the full column otherwise.
  assert.match(nav, /collapsed \? "lg:w-14" : "lg:w-60"/);
  assert.match(nav, /collapsed \? "lg:hidden" : ""/);
  // Remembered in a cookie the layout reads, so the server draws it collapsed:
  // no restore script, no flash, no hydration mismatch.
  assert.match(state, /export const COLLAPSED_COOKIE = "nezabazi_admin_nav";/);
  assert.match(nav, /document\.cookie = `\$\{COLLAPSED_COOKIE\}=/);
  assert.match(layout, /\(await cookies\(\)\)\.get\(COLLAPSED_COOKIE\)\?\.value === "1"/);
  assert.match(layout, /<AdminNav initialCollapsed=\{collapsed\} \/>/);
  assert.doesNotMatch(layout, /<script/);
});
