// The admin speed-up (6 Nov 2026, docs/performance.md): session checks read
// the token's verified claims instead of asking the Auth server, one check per
// request, an instant loading state, the account listing started alongside
// the rows, and functions pinned next to the database. Reads the source and
// asserts the invariants, so a later change cannot quietly undo them.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const repoPath = (path: string) => new URL(`../../../${path}`, import.meta.url);
const repoFile = (path: string) => readFileSync(repoPath(path), "utf8");

// Comments mention getUser() to explain the change; only code counts here.
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const proxySession = repoFile("src/lib/supabase/middleware.ts");
const adminServer = repoFile("src/lib/admin/server.ts");
const adminAccess = repoFile("src/app/admin/admin-access.tsx");
const scoringAuth = repoFile("src/lib/scoring/auth.ts");
const section = repoFile("src/app/admin/AdminDashboardSection.tsx");
const headshots = repoFile("src/lib/admin/headshot-urls.ts");

test("the four session checks verify the token's claims, never getUser()", () => {
  for (const [name, source] of [
    ["middleware.ts", proxySession],
    ["server.ts", adminServer],
    ["admin-access.tsx", adminAccess],
    ["scoring/auth.ts", scoringAuth],
  ] as const) {
    assert.doesNotMatch(code(source), /getUser\(|getSession\(/, name);
  }

  // The proxy still reads the session on every request, which is what
  // refreshes an expired token and rewrites the cookies.
  assert.match(code(proxySession), /await supabase\.auth\.getClaims\(\)/);
  assert.match(proxySession, /setAll\(cookiesToSet\)/);

  // One shared check: identity only from the verified `sub`, and the audit
  // actor built from the claims exactly as it was from the Auth user.
  const shared = code(adminServer);
  assert.match(shared, /export const getVerifiedSession = async/);
  assert.match(shared, /await supabase\.auth\.getClaims\(\)/);
  assert.match(shared, /if \(error \|\| !data\?\.claims\) \{\s*return null;/);
  assert.match(shared, /const userId = claims\.sub;/);
  assert.match(shared, /typeof userId !== "string" \|\| userId === ""/);
  assert.match(shared, /const email = typeof claims\.email === "string" \? claims\.email : null;/);
  assert.match(shared, /getMetadataString\(claims\.user_metadata, "full_name"\)\.trim\(\)/);
  assert.match(shared, /id: userId,\s*name: fullName \|\| email \|\| null,\s*email,/);
  // A verification that throws is "signed out", never let through.
  assert.match(shared, /\} catch \(error\) \{[\s\S]*?return null;\s*\}/);

  for (const [name, source] of [
    ["server.ts", adminServer],
    ["admin-access.tsx", adminAccess],
    ["scoring/auth.ts", scoringAuth],
  ] as const) {
    const body = code(source);
    assert.match(body, /const session = await getVerifiedSession\(supabase\);/, name);
    // The role is still read under the caller's own session, by the verified id.
    assert.match(body, /\.from\("profiles"\)\s*\.select\("role"\)\s*\.eq\("id", session\.userId\)/, name);
  }

  // Same refusals as before: no session = 401 / login, wrong role = 403 / denied.
  assert.match(adminServer, /if \(!session\) \{\s*return \{\s*ok: false as const,\s*response: NextResponse\.json\(\{ error: "Authentication required\." \}, \{ status: 401 \}\)/);
  assert.match(adminServer, /profile\?\.role !== "admin"[\s\S]*?status: 403/);
  assert.match(adminServer, /return \{ ok: true as const, actor: session\.actor \};/);
  assert.match(adminAccess, /if \(!session\) \{\s*return \{ kind: "login" \};/);
  assert.match(adminAccess, /if \(!profile \|\| profile\.role !== "admin"\) \{\s*return \{ kind: "denied" \};/);
  assert.match(scoringAuth, /if \(!session\) \{\s*return null;/);
  assert.match(scoringAuth, /actor: session\.actor,/);
});

test("the admin layout and page share one access check per request", () => {
  assert.match(adminAccess, /import \{ cache \} from "react";/);
  assert.match(adminAccess, /export const getAdminAccess = cache\(async \(\): Promise<AdminAccess> => \{/);
});

test("an admin menu click shows a loading state at once, with no data on it", () => {
  assert.ok(existsSync(repoPath("src/app/admin/loading.tsx")), "src/app/admin/loading.tsx exists");
  const loading = repoFile("src/app/admin/loading.tsx");
  const body = code(loading).replace(/\{\}/g, "");

  assert.match(body, /export default function AdminLoading\(\)/);
  assert.match(body, /aria-busy="true"/);
  // Presentational only: no data, no requests, no client code.
  assert.doesNotMatch(body, /\bawait\b|\bfetch\(|supabase|"use client"|\{[a-zA-Z_.]+\}/);
  // No visible text at all: every element closes right after its tag.
  assert.doesNotMatch(body, />\s*[^<\s{][^<]*</, "no text between tags");
  // Sits in the page's place, like AdminPageHeading and the section under it.
  assert.match(body, /className="px-6 pb-2 pt-6 sm:pt-8"/);
  assert.match(body, /className="px-6 pb-12 pt-4 sm:pb-16 sm:pt-6"/);
  // Muted bars: the heading's two lines and three in the card.
  assert.equal((body.match(/motion-safe:animate-pulse/g) ?? []).length, 5);
});

test("the Solo riders and Audit log pages start the account listing before awaiting rows", () => {
  const body = code(section);
  const rowsAwaited = body.indexOf("await Promise.all([");

  assert.ok(rowsAwaited > 0);
  // Only after the administrator check.
  assert.ok(body.indexOf('if (access.kind !== "admin")') < body.indexOf("loadAuthUserIndex("));

  // Solo: the listing starts before the rows, the matching runs after them.
  assert.match(body, /const authUserIndexLoad = soloService \? loadAuthUserIndex\(soloService\) : null;/);
  assert.ok(body.indexOf("loadAuthUserIndex(soloService)") < rowsAwaited);
  assert.ok(body.indexOf("matchSoloHeadshots(") > rowsAwaited);
  assert.match(body, /matchSoloHeadshots\(\s*await authUserIndexLoad,/);
  assert.doesNotMatch(body, /loadSoloHeadshots/);

  // Audit: the listing starts before the rows and is awaited after them.
  assert.ok(body.indexOf("auth.admin.listUsers(") < rowsAwaited);
  assert.ok(body.indexOf("await auditActorsLoad") > rowsAwaited);
  assert.match(body, /\}\)\(\)\.catch\(\(error: unknown\): AuditActor\[\] => \{/);

  // The split keeps one listing and one batch signing call.
  assert.match(headshots, /export const loadAuthUserIndex = async \(\s*client: ServiceRoleClient\s*\): Promise<AuthUserIndex \| null>/);
  assert.match(headshots, /export const matchSoloHeadshots = async \(\s*index: AuthUserIndex \| null,/);
  assert.match(headshots, /if \(!index\) \{\s*return result;/);
  assert.match(headshots, /\.createSignedUrls\(paths, HEADSHOT_SIGNED_URL_SECONDS\)/);
  // Only confirmed addresses match, as before.
  assert.match(headshots, /address && user\.email_confirmed_at && !idByConfirmedEmail\.has\(address\)/);
});

test("functions run in the database's region", () => {
  const config = JSON.parse(repoFile("vercel.json")) as { regions?: unknown };
  assert.deepEqual(config.regions, ["pdx1"]);
});
