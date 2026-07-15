# Solo Registration Field Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track and enforce the required solo horse/emergency fields in the database while keeping legacy rows readable and restoring the automated test suite.

**Architecture:** Extend Mani's unshipped solo-registration migration with idempotent column creation and staged `not valid` check constraints. Keep the already-strict wizard, admin form, and API unchanged; add source-level regression coverage for the migration and update the stale admin layout expectation.

**Tech Stack:** PostgreSQL 17/Supabase migrations, Next.js 16, React 19, TypeScript, Node's built-in test runner.

## Global Constraints

- `horse_name`, `emergency_contact_name`, and `emergency_contact_phone` are required on every new or updated solo registration.
- Existing incomplete rows remain readable but cannot be updated until their missing required values are supplied.
- Do not fabricate placeholder registration data.
- Do not modify or apply any scoring code, table, policy, migration, or database object.
- Do not apply the migration to the live Supabase project without a separate user request.

---

## File Map

- `src/lib/admin/audit.test.mts`: source-level regression coverage for the solo-field migration and admin mutation.
- `supabase/migrations/20260714152651_include_solo_emergency_fields_in_admin_mutation.sql`: idempotent column tracking, staged constraints, and the existing admin mutation function.
- `src/app/admin/AdminDashboard.layout.test.mts`: regression coverage for the widened solo table and its new columns.

### Task 1: Track and enforce the required database fields

**Files:**
- Modify: `src/lib/admin/audit.test.mts`
- Modify: `supabase/migrations/20260714152651_include_solo_emergency_fields_in_admin_mutation.sql`

**Interfaces:**
- Consumes: `public.solo_registrations` and the existing `public.admin_mutate_registration(...)` function signature.
- Produces: the columns `horse_name text`, `emergency_contact_name text`, and `emergency_contact_phone text`; named staged constraints ending in `_required`; the unchanged admin RPC signature.

- [ ] **Step 1: Write the failing migration regression test**

Append this test to `src/lib/admin/audit.test.mts`:

```ts
test("solo registration migration tracks required horse and emergency fields", async () => {
  const migration = await readFile(
    new URL(
      "../../../supabase/migrations/20260714152651_include_solo_emergency_fields_in_admin_mutation.sql",
      import.meta.url
    ),
    "utf8"
  );

  for (const column of [
    "horse_name",
    "emergency_contact_name",
    "emergency_contact_phone",
  ]) {
    assert.match(
      migration,
      new RegExp(`add\\s+column\\s+if\\s+not\\s+exists\\s+${column}\\s+text`, "i")
    );
    assert.match(
      migration,
      new RegExp(`${column}\\s*=\\s*p_payload\\s*->>\\s*'${column}'`, "i")
    );
  }

  for (const [field, maxLength] of [
    ["horse_name", 200],
    ["emergency_contact_name", 200],
    ["emergency_contact_phone", 30],
  ] as const) {
    assert.match(
      migration,
      new RegExp(
        `add\\s+constraint\\s+solo_registrations_${field}_required` +
          `[\\s\\S]*?${field}\\s+is\\s+not\\s+null` +
          `[\\s\\S]*?char_length\\s*\\(\\s*btrim\\s*\\(\\s*${field}\\s*\\)\\s*\\)` +
          `[\\s\\S]*?between\\s+1\\s+and\\s+${maxLength}` +
          `[\\s\\S]*?not\\s+valid`,
        "i"
      )
    );
  }

  assert.match(migration, /security\s+invoker/i);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --no-warnings --test src/lib/admin/audit.test.mts
```

Expected: the new test fails because the migration does not contain any `add column if not exists` statement.

- [ ] **Step 3: Add idempotent columns and staged strict constraints**

Prepend this SQL to `supabase/migrations/20260714152651_include_solo_emergency_fields_in_admin_mutation.sql` before `create or replace function`:

```sql
alter table public.solo_registrations
  add column if not exists horse_name text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text;

do $constraints$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.solo_registrations'::pg_catalog.regclass
      and conname = 'solo_registrations_horse_name_required'
  ) then
    alter table public.solo_registrations
      add constraint solo_registrations_horse_name_required
      check (
        horse_name is not null
        and char_length(btrim(horse_name)) between 1 and 200
      ) not valid;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.solo_registrations'::pg_catalog.regclass
      and conname = 'solo_registrations_emergency_contact_name_required'
  ) then
    alter table public.solo_registrations
      add constraint solo_registrations_emergency_contact_name_required
      check (
        emergency_contact_name is not null
        and char_length(btrim(emergency_contact_name)) between 1 and 200
      ) not valid;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.solo_registrations'::pg_catalog.regclass
      and conname = 'solo_registrations_emergency_contact_phone_required'
  ) then
    alter table public.solo_registrations
      add constraint solo_registrations_emergency_contact_phone_required
      check (
        emergency_contact_phone is not null
        and char_length(btrim(emergency_contact_phone)) between 1 and 30
      ) not valid;
  end if;
end
$constraints$;
```

Do not change the RPC arguments, `security invoker`, audit behavior, team-registration branches, or any scoring object.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
node --no-warnings --test src/lib/admin/audit.test.mts
```

Expected: all five tests in the file pass.

- [ ] **Step 5: Inspect the migration-only diff**

Run:

```powershell
git diff --check
git diff -- src/lib/admin/audit.test.mts supabase/migrations/20260714152651_include_solo_emergency_fields_in_admin_mutation.sql
```

Expected: no whitespace errors; the diff contains only the test and the new SQL preamble.

- [ ] **Step 6: Commit the database integrity fix**

```powershell
git add -- src/lib/admin/audit.test.mts supabase/migrations/20260714152651_include_solo_emergency_fields_in_admin_mutation.sql
git commit -m "fix: enforce required solo registration fields"
```

### Task 2: Repair the admin layout regression test

**Files:**
- Modify: `src/app/admin/AdminDashboard.layout.test.mts`

**Interfaces:**
- Consumes: the pushed `AdminDashboard.tsx` solo table class `min-w-[2040px]` and the headings `Horse Name`, `Emergency Contact`, and `Emergency Phone`.
- Produces: a layout regression test aligned with the widened table and its new columns.

- [ ] **Step 1: Verify the existing test is RED for the intended reason**

Run:

```powershell
node --no-warnings --test src/app/admin/AdminDashboard.layout.test.mts
```

Expected: FAIL because `/min-w-\[1535px\]/` no longer matches `AdminDashboard.tsx`.

- [ ] **Step 2: Update the width and assert the new headers**

Replace the current test body with:

```ts
test("registration tables contain long values and usable edit fields", () => {
  assert.match(source, /const adminTableInputClass =[\s\S]*?min-w-0/);
  assert.match(source, /function AdminTableText[\s\S]*?truncate/);
  assert.match(source, /min-w-\[2040px\]/);
  assert.match(source, /min-w-\[1390px\]/);
  assert.match(source, /<colgroup>/);

  for (const label of ["Horse Name", "Emergency Contact", "Emergency Phone"]) {
    assert.match(source, new RegExp(`>\\s*${label}\\s*<`));
  }
});
```

- [ ] **Step 3: Run the focused test and verify GREEN**

Run:

```powershell
node --no-warnings --test src/app/admin/AdminDashboard.layout.test.mts
```

Expected: one test passes.

- [ ] **Step 4: Commit the test repair**

```powershell
git add -- src/app/admin/AdminDashboard.layout.test.mts
git commit -m "test: cover expanded solo registration table"
```

### Task 3: Verify the complete branch and scope

**Files:**
- Verify only; no planned production-file changes.

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: fresh evidence that tests, lint, types, formatting, and scope are correct.

- [ ] **Step 1: Run the complete test suite**

Run:

```powershell
npm test
```

Expected: 19 tests pass and 0 fail.

- [ ] **Step 2: Run lint and TypeScript checks**

Run:

```powershell
npm run lint
.\node_modules\.bin\tsc.cmd --noEmit --allowImportingTsExtensions
```

Expected: both commands exit 0 with no errors.

- [ ] **Step 3: Run the production build**

Run:

```powershell
npm run build
```

Expected: the build exits 0. If `next/font` cannot reach Google Fonts in the restricted environment, report the build as environment-blocked rather than claiming success; do not copy `.env.local` into a network-enabled environment.

- [ ] **Step 4: Verify formatting, final diff, and scoring isolation**

Run:

```powershell
git diff --check origin/Mani_Branch...HEAD
git diff --name-status origin/Mani_Branch...HEAD
git diff origin/Mani_Branch...HEAD -- . ':(exclude)docs/superpowers/**'
```

Expected: no whitespace errors. Code changes are limited to the solo migration and two test files; no path or SQL statement references `score_attempts` or another scoring object.

- [ ] **Step 5: Confirm the working tree and commit history**

Run:

```powershell
git status --short --branch
git log --oneline origin/Mani_Branch..HEAD
```

Expected: a clean working tree and the design, plan, database fix, and layout-test commits above Mani's commit.
