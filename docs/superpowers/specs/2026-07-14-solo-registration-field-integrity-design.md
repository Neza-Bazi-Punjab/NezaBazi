# Solo Registration Field Integrity Fixes

## Context

Mani's `80ea7a3` commit adds `horse_name`, `emergency_contact_name`, and
`emergency_contact_phone` to the solo-registration wizard and admin dashboard.
The live database already has those nullable columns, but no recorded migration
creates them. Seven existing registrations predate the fields and contain null
values. The branch also changes the solo table width without updating its layout
test.

## Goals

- Treat the three new fields as required everywhere, just like the other solo
  registration fields.
- Record the live column additions and their integrity rules in migration
  history without fabricating legacy data.
- Allow legacy rows to remain readable, but require an administrator to provide
  all missing required values before any legacy row can be updated.
- Restore a passing automated test suite.
- Leave all scoring code, tables, policies, and migrations untouched.

## Considered Approaches

### 1. Staged strict constraints (selected)

Add the columns with `if not exists`, then add `not valid` check constraints
that require non-null, nonblank, bounded values. PostgreSQL does not scan old
rows when adding a `not valid` constraint, but it enforces the constraint on all
new and updated rows. This preserves historical records without weakening the
rules for future writes.

### 2. Placeholder backfill followed by `not null`

This would allow immediate constraint validation, but values such as `Unknown`
would be invented registration data. It was rejected.

### 3. Application-only validation

The UI and admin API would remain strict, but direct Data API writes could omit
the fields. It was rejected because required data must be enforced by the
database too.

## Design

### Database migration

Update the unshipped
`20260714152651_include_solo_emergency_fields_in_admin_mutation.sql` migration
so it first:

1. Adds `horse_name`, `emergency_contact_name`, and
   `emergency_contact_phone` as text columns when they do not already exist.
2. Adds named `not valid` check constraints when missing:
   - horse name: non-null, nonblank, at most 200 characters;
   - emergency contact name: non-null, nonblank, at most 200 characters;
   - emergency contact phone: non-null, nonblank, at most 30 characters.
3. Keeps the existing `security invoker` admin mutation function, including the
   new fields in solo updates and audit diffs.

Because the constraints are `not valid`, the migration succeeds while legacy
rows are incomplete. Any insert or update must satisfy them. After the seven
legacy registrations are completed, a separate future migration can validate
the constraints and convert the columns to `not null` if desired.

### Application behavior

Keep the pushed UI and API behavior unchanged:

- the solo wizard requires all three fields;
- the admin edit form requires all three fields;
- the admin API rejects missing, blank, oversized, or malformed payloads;
- editing an incomplete legacy row requires the administrator to enter the
  missing values before saving.

No blank-preservation exception and no placeholder values will be added.

### Tests

- Add a migration regression test that verifies the columns are tracked, the
  strict constraints are present and staged with `not valid`, and the admin
  mutation includes the new fields.
- Update the admin layout regression test to expect the new 2040-pixel minimum
  width and the added horse/emergency columns.
- Run the full test suite, lint, TypeScript checking, and a production build
  where the environment permits Google Font downloads.

## Safety and Scope

The migration changes only `public.solo_registrations` and the existing
`public.admin_mutate_registration` function. It does not read from or modify
`score_attempts` or any scoring-related object. No migration will be applied to
the live database during implementation unless the user separately requests
deployment.
