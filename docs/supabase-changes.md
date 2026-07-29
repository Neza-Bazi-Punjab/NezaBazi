# Supabase Changes and Setup Notes

This file explains the database and Auth work that was applied while building the registration flows. It is written for teammates who are joining the project after the changes were made.

## What Supabase stores

- `auth.users` stores the login email and account metadata such as name, age, location, phone, experience, and horse details.
- `profiles` stores the permanent user id and the authorization role (`player` or `admin`). A signup trigger creates the profile row.
- `solo_registrations` stores one solo event entry and links to `profiles.id` through `profile_id`.
- `teams` stores the team name and its leader profile id.
- `team_members` stores the four rider rows for a team. Non-leader rider rows currently use the typed email as their temporary link; a verified `profile_id` claim is planned for a later step.
- `registration_drafts` stores one in-progress solo form or team-wizard draft per user so registration progress survives logout and device switches. Drafts are plain form text (jsonb), readable and writable only by their owner, and deleted when the registration is submitted.

## Live migrations already applied

These migration names are present in the current Supabase migration history:

1. `lock_profiles_prevent_role_self_escalation` prevents browser users from changing their `profiles.role`. Role changes go through the server-only admin API.
2. `enforce_max_four_team_members` adds a database trigger that rejects a fifth rider on a team.
3. `registration_data_integrity_constraints` adds required-column, age, experience, horse-age, email-format, and other data checks to both registration paths.
4. `revoke_execute_on_trigger_only_functions` removes direct execution of enforcement trigger functions from client roles.
5. `revoke_execute_from_public_on_trigger_functions` corrects the previous revoke by removing the default `PUBLIC` execute grant as well.
6. `text_field_length_caps` limits names, locations, breeds, phone numbers, emails, and team names to safe lengths.
7. `lock_profiles_insert_path` removes client INSERT access and the old insert policy from `profiles`. The signup trigger still creates the profile because it runs as a security-definer trigger.
8. `registration_drafts_autosave` adds the `registration_drafts` table (one autosaved draft per user per registration type, owner-only RLS, size-capped jsonb payload, `updated_at` refresh trigger). This is the first migration whose SQL is also committed in the repo, under `supabase/migrations/`.
9. `harden_admin_audit_log` makes audit actors server-trusted, stores actor name/email snapshots, preserves audit rows when an administrator is deleted, removes browser write access to the audit table, and adds service-role-only transactional functions for registration edits and role changes.
10. `lock_admin_registration_write_paths` removes the old broad admin UPDATE/DELETE RLS policies from registration tables. Admin dashboard writes must now use the protected server route, while players and team leaders keep their existing owner-scoped permissions.
11. `registration_confirmation_codes` adds `confirmation_code`, `checked_in_at` and `checked_in_by` to `solo_registrations` and `team_members`, generates a code on every insert through a trigger, backfills the rows that registered before codes existed, and replaces the table-wide `authenticated` UPDATE grant with an explicit column list that excludes all three new columns.
12. `admin_rider_check_in` adds the service-role-only `admin_set_check_in()` and `admin_find_rider_by_code()` functions used by the check-in desk.
13. `one_confirmation_code_per_rider` makes the code belong to the rider rather than the registration. A rider may enter solo *and* ride on a team; the insert trigger now reuses their existing code (matched on normalized email) instead of issuing a second one, and `admin_set_check_in` is re-keyed from a single row id to the code, updating every entry that code covers in one transaction. Without this, checking in the solo entry left the same rider showing as absent on their team roster — skewing the "all four must check in" rule and potentially holding a present section out of the brackets. Also collapses any rider already holding two codes, though none existed when it was written.
14. `rider_headshots` adds a **private** `rider-headshots` storage bucket with owner-scoped policies: objects live at `<profile_id>/<file>` and every policy pins the first path segment to `auth.uid()`, so a browser cannot write outside its own folder. Administrators get read-only access for check-in identity confirmation. The path is stored in Auth user metadata as `headshot_path`, so the photo follows the person rather than one registration.
15. `team_member_horse_name` adds `horse_name` to `team_members`. It is nullable with a length-only check: eight rider rows predate the field, and a NOT NULL constraint would block any future update to those rows. New registrations are required to supply one by the submit route.
16. `admin_edit_team_horse_name` lets administrators edit a team rider's horse name, which `admin_mutate_registration` omitted because it predates the column. The function is patched in place from `pg_get_functiondef` rather than retyped — it is ~7 KB guarding every admin write and its audit record — and both substitutions are asserted so an unrecognised body fails loudly. Note the asymmetry it preserves: `team_members.horse_name` is nullable so the admin route treats it as optional, while `solo_registrations` has a NOT VALID `horse_name_required` check that Postgres enforces on every UPDATE — so the seven solo rows still missing a horse name cannot be edited until one is supplied.

Migrations 11 and 12 were applied to the live project on 28 July 2026 and verified there: all 13 solo registrations and 8 team riders received a valid, distinct code, with no collisions across the two tables; both insert triggers and all four functions are present; `authenticated` retains UPDATE on exactly the intended data columns (11 on `solo_registrations`, 8 on `team_members`) and on none of `confirmation_code`, `checked_in_at` or `checked_in_by`.

## Confirmation codes and check-in

Every rider receives a unique `NBP-XXXXXX` code when they register — solo entrants and all four riders on a team, one code each.

- **Generated in the database.** Solo registrations are inserted straight from the browser under RLS, so a code chosen by app code could be forged. A `before insert` trigger overwrites whatever arrived and clears the check-in columns, making a self-checked-in registration impossible at insert time.
- **Random, not sequential.** A sequential number would leak the total registration count to anyone holding a code and let a stranger guess a valid one. It would also collide with the separate bracket numbering that gets assigned once registration closes — those are two different identifiers.
- **Unique across both tables.** The desk types one code and the lookup searches solo entrants and team riders together, so a shared code would be ambiguous.
- **Readable aloud.** The alphabet omits `O/0`, `I/1` and `U`.
- **Not writable from a browser.** Postgres cannot revoke a single column from a table-wide UPDATE grant, so the grant was replaced with an explicit column list. `confirmation_code`, `checked_in_at` and `checked_in_by` are simply absent from it, leaving the audited admin route as the only write path.

Check-in runs the day before the event. An administrator enters the code, sees the rider's record and — for a team rider — how many of the four have arrived, then confirms. Checking in an already-checked-in rider raises rather than silently overwriting the original arrival time and the administrator who recorded it. Undo is available and audited the same way.

## Registration emails

The confirmation-code email goes through the **Resend API directly**, using a server-only `RESEND_API_KEY`. This is separate from the Resend SMTP settings in the Supabase dashboard: those only cover Auth emails (confirm signup, recovery, email change) rendered from Supabase's own templates, and cannot send application email.

Sending is best-effort on purpose. It happens in `after()`, so it never blocks a registration that already committed, and a missing key is a logged skip rather than an error. The code is always shown on-screen and on `/account`, and the team success page lists all four riders' codes so the leader can pass them on — riders 2-4 have no account here, so email is otherwise their only channel.

## Live schema not represented in this repo

The live project also contains two tables with no migration in `supabase/migrations/`, no entry in this document's history above, and no application code referencing them:

- `score_attempts` — `round_number`, `result` (`miss`/`touch`/`hit`), a generated `points` column (`hit` = 4, `touch` = 2, else 0), `recorded_by`, and foreign keys to both `solo_registrations` and `team_members`. This matches the agreed scoring rules. Currently empty.
- `solo_scoresheet` — `rounds` (jsonb), `total_override`, `sort_order`, `updated_by`. Currently holds 7 rows.

These appear to have been created directly in the Supabase dashboard. They are harmless where they stand, but they are undocumented drift: nothing in the repo would recreate them in a fresh project, and nothing reads or writes them. Before the scoring phase starts, either capture them as a migration or drop and redesign them alongside the bracket work.

The live database was checked after these changes: existing rows satisfy the constraints, teams have four riders, and teams have one leader. The Supabase security advisor still has intentional or deferred warnings for public trigger-function execution, leaked-password protection, and some RLS performance policies.

## Application data flow

1. A user signs up or logs in through Supabase Auth.
2. The signup trigger creates a basic `profiles` row with role `player`.
3. Account details are read from Auth metadata, not copied into `profiles`.
4. Solo registration writes through the authenticated Supabase client and is protected by RLS plus database checks.
5. Team registration submits to `/register-team/submit`, where the server validates all four riders, checks duplicate emails and phones, creates the team, and inserts the roster.
6. Account saves go through `/api/account/profile`. The route authenticates the session, updates Auth, and uses the server-only service role to synchronize matching registration rows.
7. The account page can show a rider's membership on another person's team by matching the current login email. This is useful during development, but it must be replaced by verified `profile_id` linking before public signup.
8. Admin registration changes go through `/api/admin/registrations`. The route verifies the administrator, derives the audit actor from that session, and calls a service-role-only PostgreSQL function that commits the data change and audit record together. Admin Auth changes remain in `/api/admin/users`; email changes and deletions create a required audit record before calling Supabase Auth, and role changes use an atomic database function.

## Environment and deployment

Local development needs all three variables in `.env.local`:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEONAMES_USERNAME=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
```

Never put real values in `.env.example` — it is the one `.env*` file `.gitignore` does not ignore, so anything pasted there is published on the next commit.

`GEONAMES_USERNAME` is optional and server-only: it enables the village autocomplete in the location picker (register free at geonames.org and enable "free web services" on the account page). Without it, the picker falls back to manual village/city entry.

The service-role key is server-only. Add it separately to Vercel Preview and Production environment variables. Never put it in a `NEXT_PUBLIC_` variable, browser code, Git, screenshots, or chat. The current local key is a legacy JWT key and should be rotated before public launch because it was previously shared during development.

## Email confirmation, password reset, and auth links

The production domain is `https://www.nezabazipunjab.com`, and the app side is built for confirmation and recovery emails sent through Resend. Dashboard state cannot be verified from the repository, so do not consider confirmation live until every checklist item below has been confirmed in Supabase and Resend:

- `/auth/confirm` (route handler) verifies the emailed one-time token and establishes a session, then redirects to an internal `next` path. It accepts both link styles — `token_hash` + `type` (via `verifyOtp`, works across devices) and `code` (via `exchangeCodeForSession`, default templates, same browser) — and sends failures to `/auth/auth-code-error`.
- Signup calls `signUp` with `emailRedirectTo` and, when confirmation is on, shows a "check your inbox" success page instead of logging in. After the confirmation callback establishes the session, it syncs the verified account metadata into any solo or team-member row already using that email.
- `/forgot-password` sends a reset link (`resetPasswordForEmail`); `/reset-password` sets the new password (`updateUser`) from the recovery session. A "Forgot password?" link sits on `/login`.
- Account email changes no longer stamp an unconfirmed address onto registration rows (`syncEmail: false` while a change is pending). After the user confirms, the next sign-in's POST sync reconciles the solo row by `profile_id`.
- Signup and password reset require at least 8 characters in the app; use the same or a stronger minimum in Supabase.

Dashboard settings to apply/confirm in Supabase (Authentication → URL Configuration and Email Templates):

1. **Custom SMTP**: confirm Supabase Authentication email settings use the verified Resend sender domain and that a real test email is delivered.
2. **Confirm Email**: enable it under Authentication → Providers → Email.
3. **Site URL**: `https://www.nezabazipunjab.com`
4. **Redirect URLs** (allowlist): `https://www.nezabazipunjab.com/**` and `http://localhost:3000/**` for local dev. Add only the specific Vercel preview pattern you use if preview auth testing is needed.
5. **Email templates** — for reliable cross-device links, point each action link at the confirm route with the token hash. Examples:
   - Confirm signup: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=signup`
     — no `next` here. On the signup path the route signs the user out and sends
     them to `/login?redirect=…` using the destination captured at signup time
     (defaulting to `/register`), so a `next` parameter is ignored. Escape the
     ampersands as `&amp;` in the template HTML: a bare `&` in an attribute is
     invalid and some clients drop everything after it, which would break `type`.
   - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=recovery&amp;next=/reset-password`
   - Change email address: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email_change&amp;next=/account`
   - Magic link (if used): `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=magiclink&amp;next=/account`

   These three take the normal path, so `next` is honoured — it is sanitized to an
   internal path by `getSafeRedirect`, so an external URL cannot be smuggled in.

   If a template is left on the default `{{ .ConfirmationURL }}`, the `code` fallback in `/auth/confirm` still works as long as the link is opened in the same browser that started the request.
6. **Password policy**: set the minimum to at least 8 characters and enable leaked-password protection under Authentication → Policies if the project plan supports it.
7. **Resend tracking and limits**: disable click/open tracking for authentication email, then set Supabase's email rate limit to a deliberate value within the Resend plan rather than leaving it unreviewed.
8. **Rotate the service-role key**: the development key was previously shared. Rotate it in Supabase, replace `SUPABASE_SERVICE_ROLE_KEY` in local and Vercel Preview/Production environments, and redeploy before public signup.
9. **End-to-end verification**: with a brand-new email, test signup → confirmation → account/team details, unconfirmed login, an expired link, forgot password → reset → login, and an email change. Open at least one confirmation and one recovery link on a different device or private browser session.

Known limitation that remains: rider rows on a team led by someone else are linked only by email, so a confirmed email change does not update those rows automatically. An admin can fix them from the dashboard's email-sync dialog, and verified `profile_id` linking is still the planned long-term fix.

## Important limitation

The earlier live migrations were applied before this repository began tracking SQL consistently, so a fresh project still cannot be recreated completely from `git clone`. The registration draft and audit-hardening migrations are committed under `supabase/migrations/`; before production, pull the remaining live schema into reviewed migration files and test a clean database reset.
