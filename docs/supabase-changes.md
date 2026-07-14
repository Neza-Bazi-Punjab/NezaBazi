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
```

`GEONAMES_USERNAME` is optional and server-only: it enables the village autocomplete in the location picker (register free at geonames.org and enable "free web services" on the account page). Without it, the picker falls back to manual village/city entry.

The service-role key is server-only. Add it separately to Vercel Preview and Production environment variables. Never put it in a `NEXT_PUBLIC_` variable, browser code, Git, screenshots, or chat. The current local key is a legacy JWT key and should be rotated before public launch because it was previously shared during development.

Email confirmation is currently disabled for local testing. Before public signup, configure confirmation email, the production Site URL, allowed redirect URLs, leaked-password protection, and an SMTP provider. Do not treat an unverified email as proof that a rider owns a team row.

Known caveat for that future work: when a user changes their email on `/account`, the sync route currently writes the new email onto their registration rows immediately. With confirmation disabled this is correct, but once confirmation is enabled the rows would update before the user confirms the new address (and stay wrong if they never confirm). Revisit the sync timing as part of the email-confirmation setup.

## Important limitation

The earlier live migrations were applied before this repository began tracking SQL consistently, so a fresh project still cannot be recreated completely from `git clone`. The registration draft and audit-hardening migrations are committed under `supabase/migrations/`; before production, pull the remaining live schema into reviewed migration files and test a clean database reset.
