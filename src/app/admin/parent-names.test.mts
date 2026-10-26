import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PROFILE_ROLES, isProfileRole } from "../../lib/scoring/types.ts";

const repoFile = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

const migration = repoFile(
  "supabase/migrations/20261025100000_rider_parent_names.sql"
);
const registrationsRoute = repoFile("src/app/api/admin/registrations/route.ts");
const usersRoute = repoFile("src/app/api/admin/users/route.ts");
const dashboard = repoFile("src/app/admin/AdminDashboard.tsx");
const checkInPanel = repoFile("src/app/admin/CheckInPanel.tsx");
const accountPage = repoFile("src/app/account/AccountPage.tsx");
const accountLoader = repoFile("src/app/account/page.tsx");
const soloForm = repoFile("src/app/register/solo/RegisterForm.tsx");
const teamForm = repoFile("src/app/register-team/TeamRegisterForm.tsx");
const teamSubmit = repoFile("src/app/register-team/submit/route.ts");
const drafts = repoFile("src/lib/registration-drafts.ts");

const escapeForRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("both registration tables gain nullable, length-checked parent names", () => {
  for (const table of ["solo_registrations", "team_members"]) {
    assert.match(
      migration,
      new RegExp(
        `alter table public\\.${table}\\s+add column if not exists father_name text,\\s+add column if not exists mother_name text;`
      )
    );

    for (const column of ["father_name", "mother_name"]) {
      const constraint = `${table}_${column}_length`;

      // Added only when missing, so a second run is a no-op.
      assert.match(
        migration,
        new RegExp(`conname = '${constraint}'[\\s\\S]*?add constraint ${constraint}`)
      );
      assert.match(
        migration,
        new RegExp(
          `add constraint ${constraint}\\s+check \\(\\s+${column} is null\\s+or char_length\\(btrim\\(${column}\\)\\) between 1 and 200\\s+\\)`
        )
      );
    }

    // Column grants: UPDATE on both tables is a column list since
    // registration_confirmation_codes, so new columns need their own.
    for (const privilege of ["select", "insert", "update"]) {
      assert.match(
        migration,
        new RegExp(
          `grant ${privilege} \\(father_name, mother_name\\) on public\\.${table} to authenticated;`
        )
      );
    }
  }

  // Optional, never NOT NULL: rows registered before the fields existed
  // must stay editable.
  assert.doesNotMatch(migration, /father_name text not null/i);
  assert.doesNotMatch(migration, /set not null/i);
});

test("admin_mutate_registration is patched in place, both lists and both UPDATEs", () => {
  const patch = migration.slice(
    migration.indexOf("do $patch$"),
    migration.indexOf("$patch$;")
  );

  assert.match(patch, /pg_get_functiondef\(target_function\)/);
  assert.match(patch, /execute definition;/);

  // Both editable field arrays, which drive the audit diff.
  assert.ok(
    patch.includes(
      "E'    ''horse_breed'',\\n    ''father_name'',\\n    ''mother_name''\\n  ];\\n  solo_editable_fields'"
    ),
    "the team-member field list gains both columns"
  );
  assert.ok(
    patch.includes(
      "E'    ''emergency_contact_phone'',\\n    ''father_name'',\\n    ''mother_name''\\n  ];\\nbegin'"
    ),
    "the solo field list gains both columns"
  );

  // Both UPDATE statements, storing a blank as null.
  for (const column of ["father_name", "mother_name"]) {
    assert.ok(
      patch.includes(
        `when p_payload ? ''${column}'' then nullif(btrim(p_payload ->> ''${column}''), '''')`
      ),
      `the solo UPDATE writes ${column}`
    );
    assert.ok(
      patch.includes(
        `when member_payload ? ''${column}'' then nullif(btrim(member_payload ->> ''${column}''), '''')`
      ),
      `the team member UPDATE writes ${column}`
    );
  }

  // Every substitution is asserted, and skipped when already applied.
  assert.match(patch, /continue when position\(substitution\[3\] in definition\) > 0;/);
  assert.match(patch, /if occurrences <> 1 then/);
  assert.match(patch, /if patched = definition then\s+raise exception 'Could not add the parents'' names to %\.'/);
  assert.match(patch, /raise exception 'admin_mutate_registration does not write the parents'' names in %\.'/);
});

test("admin_find_rider_by_code is dropped and recreated with both columns", () => {
  const dropAt = migration.indexOf(
    "drop function if exists public.admin_find_rider_by_code(text);"
  );
  const createAt = migration.indexOf(
    "create function public.admin_find_rider_by_code(p_code text)"
  );

  assert.ok(dropAt > -1, "the function is dropped first — its return type changes");
  assert.ok(createAt > dropAt, "and created after the drop");

  const definition = migration.slice(createAt, migration.indexOf("$$;", createAt));

  assert.match(definition, /full_name text,\s+father_name text,\s+mother_name text,/);

  for (const source of ["registration", "member"]) {
    assert.match(definition, new RegExp(`${source}\\.father_name,`));
    assert.match(definition, new RegExp(`${source}\\.mother_name,`));
  }

  // Still security invoker, stable, empty search path, as before.
  assert.match(definition, /language sql\s+security invoker\s+stable\s+set search_path = ''/);
});

test("execute grants are restated for both functions", () => {
  for (const signature of [
    "public.admin_mutate_registration(text, uuid, jsonb, uuid, text, text, uuid)",
    "public.admin_find_rider_by_code(text)",
  ]) {
    const escaped = escapeForRegExp(signature);

    assert.match(
      migration,
      new RegExp(`revoke execute on function ${escaped}\\s+from public, anon, authenticated;`)
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function ${escaped}\\s+to service_role;`)
    );
  }

  // The recreated function's revoke must come after it is created, or the
  // default grants Supabase adds to new functions would survive.
  const createAt = migration.indexOf(
    "create function public.admin_find_rider_by_code(p_code text)"
  );
  const revokeAt = migration.lastIndexOf(
    "revoke execute on function public.admin_find_rider_by_code(text)"
  );
  assert.ok(revokeAt > createAt);
});

test("the admin route treats both names as optional bounded strings", () => {
  assert.match(
    registrationsRoute,
    /const isOptionalBoundedString = \(value: unknown, maxLength: number\) =>\s+value === undefined \|\|\s+value === null \|\|\s+\(typeof value === "string" && value\.length <= maxLength\);/
  );
  assert.match(
    registrationsRoute,
    /isOptionalBoundedString\(value\.father_name, PARENT_NAME_MAX_LENGTH\)/
  );
  assert.match(
    registrationsRoute,
    /isOptionalBoundedString\(value\.mother_name, PARENT_NAME_MAX_LENGTH\)/
  );
  assert.match(registrationsRoute, /const PARENT_NAME_MAX_LENGTH = 200;/);
  assert.doesNotMatch(registrationsRoute, /isBoundedString\(value\.(father|mother)_name/);

  // Rebuilt from validated fields, so unknown keys never reach the database.
  assert.match(registrationsRoute, /p_payload: payload,/);
  assert.doesNotMatch(registrationsRoute, /p_payload: payload \?\? \{\}/);

  // The actor still comes from the verified session.
  assert.match(registrationsRoute, /p_actor_id: adminCheck\.actor\.id/);
});

test("the dashboard edits both names as optional fields and searches them", () => {
  assert.match(dashboard, /\{ field: "father_name", label: "Father's name", optional: true \}/);
  assert.match(dashboard, /\{ field: "mother_name", label: "Mother's name", optional: true \}/);
  assert.match(dashboard, /\(\{ field, optional \}\) => !optional && draftValue\(draft, field\) === ""/);

  assert.match(dashboard, /\(person\.father_name \?\? ""\)\.toLowerCase\(\)\.includes\(query\)/);
  assert.match(dashboard, /\(person\.mother_name \?\? ""\)\.toLowerCase\(\)\.includes\(query\)/);

  // Sent on both the solo and the team edit.
  assert.equal(
    (dashboard.match(/father_name: String\((editDraft|draft)\.father_name \?\? ""\)\.trim\(\)/g) ?? [])
      .length,
    2
  );
});

test("riders can give both names on either form, and they are saved", () => {
  for (const field of ["fatherName", "motherName"]) {
    assert.match(drafts, new RegExp(`${field}\\?: string;`));
  }

  assert.match(soloForm, /Father&apos;s Name \(optional\)/);
  assert.match(soloForm, /Mother&apos;s Name \(optional\)/);
  assert.match(soloForm, /father_name: fatherName\.trim\(\) \|\| null,/);
  assert.match(soloForm, /mother_name: motherName\.trim\(\) \|\| null,/);

  assert.match(teamForm, /Father&apos;s Name \(optional\)/);
  assert.match(teamForm, /Mother&apos;s Name \(optional\)/);
  assert.match(teamForm, /reviewRow\("Father's Name", rider\.fatherName\.trim\(\)\)/);

  assert.match(teamSubmit, /father_name: rider\.fatherName \|\| null,/);
  assert.match(teamSubmit, /mother_name: rider\.motherName \|\| null,/);
  assert.match(teamSubmit, /rider\.fatherName\.trim\(\)\.length > PARENT_NAME_MAX_LENGTH/);
  assert.match(teamSubmit, /const PARENT_NAME_MAX_LENGTH = 200;/);

  // Optional: never in the submit route's required list.
  const required = teamSubmit.slice(
    teamSubmit.indexOf("const requiredText"),
    teamSubmit.indexOf("for (const [field, fieldLabel] of requiredText)")
  );
  assert.doesNotMatch(required, /fatherName|motherName/);
});

test("the check-in desk and /account show both names", () => {
  assert.match(checkInPanel, /<Detail label="Father's Name" value=\{rider\.father_name \?\? null\} \/>/);
  assert.match(checkInPanel, /<Detail label="Mother's Name" value=\{rider\.mother_name \?\? null\} \/>/);

  // Hidden on the account cards while null.
  assert.match(accountPage, /\{fatherName \? <Detail label="Father's Name" value=\{fatherName\} \/> : null\}/);
  assert.equal((accountLoader.match(/full_name, father_name, mother_name,/g) ?? []).length, 3);
});

test("paper-entry placeholder addresses are never shown as an email", () => {
  // One implementation, in src/lib/paper-registration.ts. The dashboard no
  // longer exports a copy, so /account does not pull the dashboard bundle in
  // and CheckInPanel <-> AdminDashboard is not a circular import.
  assert.doesNotMatch(dashboard, /displayRegistrationEmail/);
  assert.doesNotMatch(dashboard, /"No email \(paper entry\)"/);

  for (const source of [dashboard, checkInPanel, accountPage]) {
    assert.match(source, /import \{[^}]*\bdisplayEmail\b[^}]*\} from "@\/lib\/paper-registration";/);
    assert.doesNotMatch(source, /from "[^"]*AdminDashboard"/);
    assert.doesNotMatch(source, /label="Email" value=\{(rider|member|soloRegistration)\.email\}/);
  }

  assert.doesNotMatch(dashboard, /<AdminTableText value=\{(registration|member)\.email\} \/>/);
});

test("the edit form never saves the display text and keeps a paper placeholder", () => {
  // The box starts blank for a placeholder, and a blank box saves the stored
  // placeholder back; a new address on the reserved domain is refused.
  assert.match(dashboard, /email: editableEmail\(registration\.email\)/);
  assert.match(dashboard, /email: editableEmail\(member\.email\)/);
  assert.match(dashboard, /email: resolvedDraft\.email/);
  assert.match(dashboard, /email: emailToSave\(draft\.email, member\.email\)/);
  assert.doesNotMatch(dashboard, /email: String\((editDraft|draft)\.email/);
  assert.match(registrationsRoute, /isPaperPlaceholderEmail/);
});

test("the users route accepts the four roles and keeps the last admin", () => {
  assert.deepEqual([...PROFILE_ROLES], ["player", "judge", "commentator", "admin"]);

  for (const role of PROFILE_ROLES) {
    assert.equal(isProfileRole(role), true);
  }

  assert.equal(isProfileRole("owner"), false);

  assert.match(usersRoute, /import \{ isProfileRole, type ProfileRole \} from "@\/lib\/scoring\/types";/);
  assert.match(usersRoute, /!isProfileRole\(newRole\)/);
  assert.doesNotMatch(usersRoute, /newRole !== "admin" && newRole !== "player"/);

  // Roles are listed as stored, not collapsed to admin/player.
  assert.doesNotMatch(usersRoute, /role === "admin" \? "admin" : "player"/);
  assert.match(usersRoute, /isProfileRole\(storedRole\) \? storedRole : "player"/);

  // Any demotion of an administrator counts, not only to player.
  assert.match(
    usersRoute,
    /targetProfile\.role === "admin" && newRole !== undefined && newRole !== "admin"/
  );
  assert.match(usersRoute, /Cannot demote the last remaining admin\./);

  // The role write still goes through the audited function with the
  // verified actor.
  assert.match(usersRoute, /"admin_set_profile_role"/);
  assert.match(usersRoute, /p_actor_id: adminCheck\.actor\.id/);

  // And the dashboard offers all four.
  assert.match(dashboard, /\{PROFILE_ROLES\.map\(\(role\) => \(/);
  assert.doesNotMatch(dashboard, /Demote to User/);
});

test("the dashboard labels scoring audit rows and links the new admin pages", () => {
  for (const [table, label] of [
    ["scoring_rounds", "Scoring Round"],
    ["scoring_runs", "Scoring Run"],
    ["scoring_live_state", "Live Display"],
    ["scoring_advance_overrides", "Advance Override"],
    ["registrations", "Registrations"],
  ]) {
    assert.match(dashboard, new RegExp(`${table}: "${label}",`));
  }

  // Paper entries are audited as their own action.
  assert.match(dashboard, /paper_registration: "Paper Registration Entered",/);

  assert.match(dashboard, /<Link\s+href="\/admin\/scoring"[\s\S]*?>\s*Scoring\s*<\/Link>/);
  assert.match(dashboard, /<Link\s+href="\/admin\/paper"[\s\S]*?>\s*Paper entry\s*<\/Link>/);
});
