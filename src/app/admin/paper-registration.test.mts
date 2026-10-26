import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PDFDocument } from "pdf-lib";

import {
  PAPER_EMAIL_DISPLAY,
  PAPER_EMAIL_DOMAIN,
  PAPER_RIDER_FIELDS,
  displayEmail,
  emptySoloInput,
  emptyTeamInput,
  isPaperPlaceholderEmail,
  parsePaperRegistrationRequest,
  parsePaperRegistrationResult,
  validatePaperSolo,
  validatePaperTeam,
  type PaperRiderInput,
} from "../../lib/paper-registration.ts";

const repoPath = (path: string) => new URL(`../../../${path}`, import.meta.url);
const repoFile = (path: string) => readFileSync(repoPath(path), "utf8");

const migration = repoFile("supabase/migrations/20261025130000_paper_registrations.sql");
const route = repoFile("src/app/api/admin/paper-registration/route.ts");
const matchesRoute = repoFile("src/app/api/admin/paper-registration/matches/route.ts");
const lib = repoFile("src/lib/paper-registration.ts");
const resend = repoFile("src/lib/email/resend.ts");
const buildScript = repoFile("scripts/build-paper-forms.mts");
const adminPage = repoFile("src/app/admin/paper/page.tsx");
const panel = repoFile("src/app/admin/paper/PaperEntryPanel.tsx");
const paperPage = repoFile("src/app/register/paper/page.tsx");
const registerPage = repoFile("src/app/register/page.tsx");
const packageJson = repoFile("package.json");

const functionBody = (name: string) => {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  assert.notEqual(start, -1, `${name} must be defined`);
  const end = migration.indexOf("\n$$;", start);
  return migration.slice(start, end);
};

const rider = (overrides: Partial<PaperRiderInput> = {}): PaperRiderInput => ({
  full_name: "Harpreet Singh",
  father_name: "Gurmeet Singh",
  mother_name: "",
  age: "28",
  phone: "98765 43210",
  email: "",
  village_city: "Jandiala Guru",
  district: "Amritsar",
  state: "Punjab",
  country: "India",
  years_experience: "6",
  horse_name: "Toofan",
  horse_age: "9",
  horse_breed: "Marwari",
  ...overrides,
});

// ---------------------------------------------------------------------------
// Migration

test("the paper entry function is service-role only", () => {
  const entry = functionBody("admin_create_paper_registration");

  assert.match(
    entry,
    /admin_create_paper_registration\(\s*p_type text,\s*p_payload jsonb,\s*p_actor_id uuid,\s*p_actor_name text,\s*p_actor_email text\s*\)\s*returns jsonb/
  );
  assert.match(entry, /security invoker/);
  assert.match(entry, /set search_path = ''/);

  assert.match(
    migration,
    /revoke execute on function public\.admin_create_paper_registration\(text, jsonb, uuid, text, text\)\s*from public, anon, authenticated;/
  );
  assert.match(
    migration,
    /grant execute on function public\.admin_create_paper_registration\(text, jsonb, uuid, text, text\)\s*to service_role;/
  );

  // Every helper and the trigger function too, not just the entry point.
  for (const helper of [
    "paper_registration_text",
    "paper_registration_integer",
    "paper_registration_phone_key",
    "paper_registration_rider",
    "paper_registration_placeholder_email",
    "lock_registration_source",
  ]) {
    assert.match(
      migration,
      new RegExp(`revoke execute on function public\\.${helper}\\([^)]*\\)\\s*from public, anon, authenticated;`),
      `${helper} must be revoked from browser roles`
    );
    assert.match(functionBody(helper), /set search_path = ''/);
  }

  assert.doesNotMatch(migration, /security definer/);
  assert.doesNotMatch(migration, /grant execute[^;]*to (anon|authenticated|public)/);
});

test("a rider without email gets a placeholder on the reserved domain", () => {
  const placeholder = functionBody("paper_registration_placeholder_email");

  assert.match(placeholder, /candidate := 'no-email-';/);
  assert.match(placeholder, /for character_index in 1\.\.12 loop/);
  assert.match(placeholder, /alphabet constant text := 'abcdefghijklmnopqrstuvwxyz0123456789'/);
  assert.match(placeholder, /candidate := candidate \|\| '@paper\.nezabazipunjab\.com';/);

  // Unique across both registration tables.
  assert.match(placeholder, /from public\.solo_registrations/);
  assert.match(placeholder, /from public\.team_members/);

  // Generated only when the email box was blank, and a typed address on the
  // reserved domain is refused.
  assert.match(
    functionBody("admin_create_paper_registration"),
    /coalesce\(rider ->> 'email', public\.paper_registration_placeholder_email\(\)\)/
  );
  assert.match(functionBody("paper_registration_rider"), /are reserved/);
  assert.equal(PAPER_EMAIL_DOMAIN, "paper.nezabazipunjab.com");
});

test("the NOT NULL drops are guarded by pg_attribute and announced", () => {
  const nullable = migration.slice(
    migration.indexOf("do $nullable$"),
    migration.indexOf("$nullable$;")
  );

  assert.match(
    nullable,
    /if exists \([\s\S]*?attname = 'profile_id'\s*and attnotnull\s*\) then\s*alter table public\.solo_registrations alter column profile_id drop not null;\s*raise notice/
  );
  assert.match(
    nullable,
    /if exists \([\s\S]*?attname = 'leader_profile_id'\s*and attnotnull\s*\) then\s*alter table public\.teams alter column leader_profile_id drop not null;\s*raise notice/
  );

  // Nowhere else drops a NOT NULL.
  assert.equal(migration.match(/drop not null/g)?.length, 2);
});

test("provenance columns are readable but never writable from a browser", () => {
  for (const table of ["solo_registrations", "teams"]) {
    assert.match(
      migration,
      new RegExp(
        `alter table public\\.${table}\\s*add column if not exists registration_source text not null default 'online',\\s*add column if not exists entered_by uuid\\s*references public\\.profiles\\(id\\) on delete set null;`
      )
    );
    assert.match(
      migration,
      new RegExp(`check \\(registration_source in \\('online', 'paper'\\)\\)`)
    );
    assert.match(
      migration,
      new RegExp(`grant select \\(registration_source, entered_by\\) on public\\.${table} to authenticated;`)
    );
  }

  assert.doesNotMatch(migration, /grant (insert|update)[^;]*registration_source/);
  assert.doesNotMatch(migration, /grant (insert|update)[^;]*entered_by/);

  // A table-wide INSERT grant cannot have a column revoked, so browser roles
  // are pinned by a trigger instead.
  const lock = functionBody("lock_registration_source");
  assert.match(lock, /current_user in \('anon', 'authenticated'\)/);
  assert.match(lock, /new\.registration_source := 'online';/);
  assert.match(lock, /new\.entered_by := null;/);
});

test("the function validates with the online bounds and audits each registration", () => {
  const riderBody = functionBody("paper_registration_rider");

  assert.match(riderBody, /'Full name', 200, true/);
  assert.match(riderBody, /'Age', 1, 120/);
  assert.match(riderBody, /'Phone number', 30, true/);
  assert.match(riderBody, /'Email', 254, false/);
  assert.match(riderBody, /'Years of tent-pegging experience', 0, 100/);
  assert.match(riderBody, /'Horse age', 0, 60/);
  assert.match(riderBody, /'Horse breed', 200, true/);
  assert.match(riderBody, /father_name/);
  assert.match(riderBody, /mother_name/);

  const entry = functionBody("admin_create_paper_registration");

  assert.match(entry, /p_type not in \('solo', 'team'\)/);
  assert.match(entry, /jsonb_array_length\(p_payload -> 'riders'\) <> 4/);
  assert.match(entry, /errcode = '22023'/);
  assert.match(entry, /hint = 'duplicate_registration'/);

  // Duplicates are looked for in both registration tables.
  const duplicates = entry.slice(entry.indexOf("for conflict in"), entry.indexOf("end loop;", entry.indexOf("for conflict in")));
  assert.match(duplicates, /from public\.solo_registrations/);
  assert.match(duplicates, /from public\.team_members/);

  // Inserted as paper rows with no account, by the verified administrator.
  assert.match(entry, /'paper',\s*p_actor_id/);
  assert.match(entry, /values \(\s*null,\s*rider ->> 'full_name'/);
  assert.match(entry, /rider_index = 0\s*\)/);

  // One audit row per registration, in the same transaction.
  assert.equal(entry.match(/insert into public\.admin_audit_log/g)?.length, 2);
  assert.equal(entry.match(/'paper_registration',/g)?.length, 2);
  assert.match(entry, /p_payload \|\| jsonb_build_object\(/);
  assert.match(entry, /'confirmation_codes', created_codes/);

  // The confirmation codes come from the existing trigger, never from here.
  assert.doesNotMatch(entry, /generate_confirmation_code/);
  assert.match(entry, /returning[\s\S]*?confirmation_code/);
});

test("the migration sorts after the parents' names and checks for them", () => {
  assert.ok("20261025130000_paper_registrations.sql" > "20261025100000_rider_parent_names.sql");
  assert.match(migration, /\('solo_registrations', 'father_name'\)/);
  assert.match(migration, /\('team_members', 'mother_name'\)/);
  assert.match(migration, /tgname = 'assign_confirmation_code'/);
});

// ---------------------------------------------------------------------------
// Routes

test("paper entry is admin-only and takes the actor from the session", () => {
  assert.match(route, /export const dynamic = "force-dynamic";/);
  assert.match(route, /export async function POST/);
  assert.equal(route.match(/await verifyAdminRequest\(\)/g)?.length, 1);
  assert.ok(
    route.indexOf("await verifyAdminRequest()") < route.indexOf("await readJsonBody(request"),
    "the session is checked before the body is read"
  );

  assert.match(route, /p_actor_id: adminCheck\.actor\.id/);
  assert.match(route, /p_actor_name: adminCheck\.actor\.name/);
  assert.match(route, /p_actor_email: adminCheck\.actor\.email/);
  assert.doesNotMatch(route, /body\.actor|body\.p_actor|actor_id:\s*body/);

  // The parser reads only form fields, never anything naming an actor.
  const parser = lib.slice(lib.indexOf("export const parsePaperRegistrationRequest"));
  assert.doesNotMatch(parser.slice(0, parser.indexOf("// ----")), /actor/);

  // Body validated with type guards, not cast.
  assert.doesNotMatch(route, /as \{|as Record|as Paper/);

  // 22023 is the caller's mistake (400) or a duplicate (409); anything
  // unexpected is a generic 500 that leaks no database detail.
  assert.match(route, /error\.code === "22023"/);
  assert.match(route, /error\.hint === DUPLICATE_HINT \? 409 : 400/);
  assert.match(route, /error\.code === "P0002"/);
  assert.match(route, /status: 500/);
});

test("the duplicate lookup is admin-only and searches both tables safely", () => {
  assert.match(matchesRoute, /export const dynamic = "force-dynamic";/);
  assert.match(matchesRoute, /export async function GET/);
  assert.match(matchesRoute, /await verifyAdminRequest\(\)/);
  assert.match(matchesRoute, /from\("solo_registrations"\)/);
  assert.match(matchesRoute, /from\("team_members"\)/);
  assert.match(matchesRoute, /escapeIlikePattern\(name\)/);
  assert.doesNotMatch(matchesRoute, /\.or\(/);
  // Placeholders are shown as "No email (paper entry)", never as the address.
  assert.match(matchesRoute, /email: displayEmail\(/);
});

test("Resend is never asked to send to the placeholder domain", () => {
  assert.match(resend, /import \{ isPaperPlaceholderEmail \} from "@\/lib\/paper-registration";/);

  const refusal = resend.indexOf("if (isPaperPlaceholderEmail(to))");
  assert.notEqual(refusal, -1);
  assert.ok(refusal < resend.indexOf("fetch(RESEND_ENDPOINT"), "refused before Resend is called");
  assert.match(resend.slice(refusal, refusal + 300), /status: "skipped"/);
});

// ---------------------------------------------------------------------------
// Shared validation

test("placeholder addresses are recognised and displayed as no email", () => {
  assert.equal(isPaperPlaceholderEmail("no-email-abc123def456@paper.nezabazipunjab.com"), true);
  assert.equal(isPaperPlaceholderEmail("  NO-EMAIL-X@Paper.NezaBaziPunjab.com "), true);
  assert.equal(isPaperPlaceholderEmail("x@sub.paper.nezabazipunjab.com"), true);
  assert.equal(isPaperPlaceholderEmail("rider@nezabazipunjab.com"), false);
  assert.equal(isPaperPlaceholderEmail("rider@notpaper.nezabazipunjab.com"), false);
  assert.equal(isPaperPlaceholderEmail(null), false);

  assert.equal(displayEmail("no-email-abc123def456@paper.nezabazipunjab.com"), PAPER_EMAIL_DISPLAY);
  assert.equal(PAPER_EMAIL_DISPLAY, "No email (paper entry)");
  assert.equal(displayEmail("rider@example.com"), "rider@example.com");
});

test("a solo paper form validates like the online form, with email optional", () => {
  const result = validatePaperSolo({
    ...rider(),
    emergency_contact_name: "Gurmeet Singh",
    emergency_contact_phone: "98140 00000",
  });

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.equal(result.payload.email, null);
    assert.equal(result.payload.mother_name, null);
    assert.equal(result.payload.age, 28);
    assert.equal(result.payload.horse_age, 9);
  }

  const bad = validatePaperSolo({
    ...emptySoloInput(),
    ...rider({ age: "130", email: "someone@paper.nezabazipunjab.com", village_city: "", district: "", state: "", country: "" }),
  });

  assert.equal(bad.ok, false);

  if (!bad.ok) {
    assert.match(bad.errors.age, /from 1 to 120/);
    assert.match(bad.errors.email, /reserved/);
    assert.match(bad.errors.village_city, /village or city/);
    assert.match(bad.errors.emergency_contact_name, /required/);
    // Errors come back in the order of the printed sheet.
    assert.equal(Object.keys(bad.errors)[0], "age");
  }
});

test("a team needs four different riders, leader first", () => {
  const team = {
    ...emptyTeamInput(),
    team_name: "Majha Riders",
    emergency_contact_name: "Gurmeet Singh",
    emergency_contact_phone: "98140 00000",
    riders: [
      rider(),
      rider({ full_name: "Rider Two", phone: "98765-43211", email: "two@example.com" }),
      rider({ full_name: "Rider Three", phone: "98765 43212" }),
      rider({ full_name: "Rider Four", phone: "9876543210" }),
    ],
  };

  const duplicate = validatePaperTeam(team);
  assert.equal(duplicate.ok, false);

  if (!duplicate.ok) {
    assert.match(duplicate.errors["riders.3.phone"], /Same phone number as rider 1 \(team leader\)/);
  }

  team.riders[3] = rider({ full_name: "Rider Four", phone: "98765 43213" });
  const valid = validatePaperTeam(team);
  assert.equal(valid.ok, true);

  if (valid.ok) {
    assert.equal(valid.payload.riders.length, 4);
    assert.equal(valid.payload.riders[0].full_name, "Harpreet Singh");
    assert.equal(valid.payload.riders[1].email, "two@example.com");
  }
});

test("request parsing ignores unknown keys and rejects wrong types", () => {
  const parsed = parsePaperRegistrationRequest({
    type: "solo",
    actor: { id: "forged" },
    registration: { ...rider(), age: 28, p_actor_id: "forged", emergency_contact_name: "A", emergency_contact_phone: "1" },
  });

  assert.ok(parsed);
  assert.equal(parsed?.type, "solo");
  assert.equal(JSON.stringify(parsed).includes("forged"), false);
  assert.equal(parsed?.type === "solo" ? parsed.input.age : null, "28");

  assert.equal(parsePaperRegistrationRequest({ type: "solo", registration: { ...rider(), age: { $gt: 1 } } }), null);
  assert.equal(parsePaperRegistrationRequest({ type: "admin", registration: rider() }), null);
  assert.equal(
    parsePaperRegistrationRequest({ type: "team", registration: { team_name: "X", riders: [rider()] } }),
    null
  );
});

test("the database result is checked before it reaches the browser", () => {
  const solo = parsePaperRegistrationResult({
    type: "solo",
    registration_id: "5f0c7c2e-1f43-4c55-9d8e-0c0e3b8f4a11",
    team_name: null,
    riders: [
      {
        id: "5f0c7c2e-1f43-4c55-9d8e-0c0e3b8f4a11",
        full_name: "Harpreet Singh",
        email: "no-email-abc123def456@paper.nezabazipunjab.com",
        confirmation_code: "NBP-7K4M2Q",
        is_leader: false,
      },
    ],
  });

  assert.equal(solo?.riders[0].confirmation_code, "NBP-7K4M2Q");
  assert.equal(parsePaperRegistrationResult({ type: "team", registration_id: "x", riders: [] }), null);
  assert.equal(parsePaperRegistrationResult(null), null);
});

// ---------------------------------------------------------------------------
// Forms and pages

test("the build script writes both PDFs into public/documents", () => {
  assert.match(packageJson, /"build:forms": "node --no-warnings scripts\/build-paper-forms\.mts"/);
  assert.match(buildScript, /const OUTPUT_DIR = join\(ROOT, "public", "documents"\);/);
  assert.match(buildScript, /solo: join\(OUTPUT_DIR, "registration-form-solo\.pdf"\)/);
  assert.match(buildScript, /team: join\(OUTPUT_DIR, "registration-form-team\.pdf"\)/);
  assert.match(buildScript, /await writeFile\(file, bytes\);/);

  // Event facts from site.ts; the field list shared with the admin panel.
  assert.match(buildScript, /from "\.\.\/src\/lib\/site\.ts"/);
  assert.match(buildScript, /from "\.\.\/src\/lib\/paper-registration\.ts"/);
  assert.match(panel, /PAPER_RIDER_FIELDS/);

  // A failed font download degrades to English only rather than failing.
  assert.match(buildScript, /Building the forms in English only/);
});

test("the committed forms open, with the expected pages and fillable fields", async () => {
  const solo = await PDFDocument.load(readFileSync(repoPath("public/documents/registration-form-solo.pdf")));
  const team = await PDFDocument.load(readFileSync(repoPath("public/documents/registration-form-team.pdf")));

  assert.equal(solo.getPageCount(), 1);
  assert.equal(team.getPageCount(), 2);

  const soloNames = solo.getForm().getFields().map((field) => field.getName());
  const teamNames = team.getForm().getFields().map((field) => field.getName());

  assert.equal(new Set(soloNames).size, soloNames.length);
  assert.equal(new Set(teamNames).size, teamNames.length);

  for (const definition of PAPER_RIDER_FIELDS) {
    assert.ok(soloNames.includes(definition.key), `solo form has ${definition.key}`);

    for (let index = 1; index <= 4; index += 1) {
      assert.ok(teamNames.includes(`rider${index}_${definition.key}`), `team form has rider${index}_${definition.key}`);
    }
  }

  for (const name of ["emergency_contact_name", "rider_signature", "signature_date", "office_confirmation_code", "office_entered_by", "office_date_entered", "office_checked"]) {
    assert.ok(soloNames.includes(name), `solo form has ${name}`);
  }

  for (const name of ["team_name", "team_emergency_contact_phone", "rider4_signature", "office_rider4_confirmation_code", "office_checked"]) {
    assert.ok(teamNames.includes(name), `team form has ${name}`);
  }

  // Boxes tall enough to write in: at least 9 mm (the widget is inset 1 pt).
  for (const document of [solo, team]) {
    for (const field of document.getForm().getFields()) {
      for (const widget of field.acroField.getWidgets()) {
        assert.ok(widget.getRectangle().height + 2 >= 9 * (72 / 25.4) - 0.01, `${field.getName()} is at least 9 mm tall`);
      }
    }
  }
});

test("no organisation is named and the forms carry the event facts", () => {
  assert.match(buildScript, /site\.title/);
  assert.match(buildScript, /site\.eventDate/);
  assert.match(buildScript, /site\.venue/);
  assert.match(buildScript, /site\.email/);
  assert.match(buildScript, /HOST = site\.url/);
  // Printed and published text only — the comments state the rule itself.
  const withoutComments = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  assert.doesNotMatch(
    withoutComments(buildScript + paperPage),
    /\b(club|sponsor(ed)? by|society|association|federation)\b/i
  );
});

test("the paper pages are reachable and the admin page is gated", () => {
  assert.match(registerPage, /href="\/register\/paper"/);
  assert.match(registerPage, /Prefer paper\? Download the form/);

  assert.match(paperPage, /title: "Paper Registration"/);
  assert.match(paperPage, /registration-form-solo\.pdf/);
  assert.match(paperPage, /registration-form-team\.pdf/);
  assert.match(paperPage, /site\.email/);

  assert.match(adminPage, /robots: \{ index: false, follow: false \}/);
  assert.match(adminPage, /profile\.role !== "admin"/);
  assert.match(adminPage, /\/login\?redirect=\/admin\/paper/);
  assert.match(panel, /\/api\/admin\/paper-registration\/matches/);
});

test("a paper solo rider is linked to their account by confirmed email", () => {
  const sync = repoFile("src/lib/supabase/sync-registration-profile.ts");
  const accountRoute = repoFile("src/app/api/account/profile/route.ts");

  // Claimed before the update-by-profile_id, paper rows only, unclaimed only.
  const claim = sync.indexOf("await claimPaperSoloRegistration(");
  const soloUpdate = sync.indexOf('.eq("profile_id", userId)\n    .select("id")');
  assert.notEqual(claim, -1);
  assert.ok(claim < soloUpdate, "claim runs before the solo update by profile_id");
  assert.match(sync, /\.update\(\{ profile_id: userId \}\)\s*\.is\("profile_id", null\)\s*\.eq\("registration_source", "paper"\)\s*\.ilike\("email", escapeIlikePattern\(confirmedEmail\)\)/);

  // Both callers pass the address the session has already confirmed.
  assert.match(sync, /if \(!hasConfirmedEmail\(user\)\)[\s\S]*confirmedEmail: user\.email,/);
  assert.match(accountRoute, /confirmedEmail: previousEmail,/);
});

test("the registrations route keeps placeholders and explains a start-list delete", () => {
  const registrations = repoFile("src/app/api/admin/registrations/route.ts");

  assert.match(registrations, /This rider is in a start list; remove them from the round first\./);
  assert.match(registrations, /isPaperPlaceholderEmail/);
  // Postgres text is not forwarded except the human 22023 / P0002 messages.
  assert.doesNotMatch(registrations, /error: error\.message \}/);
});
