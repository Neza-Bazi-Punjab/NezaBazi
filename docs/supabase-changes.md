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
   - Confirm signup: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/account`
   - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`
   - Change email address: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/account`
   - Magic link (if used): `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next=/account`

   If a template is left on the default `{{ .ConfirmationURL }}`, the `code` fallback in `/auth/confirm` still works as long as the link is opened in the same browser that started the request.
6. **Password policy**: set the minimum to at least 8 characters and enable leaked-password protection under Authentication → Policies if the project plan supports it.
7. **Resend tracking and limits**: disable click/open tracking for authentication email, then set Supabase's email rate limit to a deliberate value within the Resend plan rather than leaving it unreviewed.
8. **Rotate the service-role key**: the development key was previously shared. Rotate it in Supabase, replace `SUPABASE_SERVICE_ROLE_KEY` in local and Vercel Preview/Production environments, and redeploy before public signup.
9. **End-to-end verification**: with a brand-new email, test signup → confirmation → account/team details, unconfirmed login, an expired link, forgot password → reset → login, and an email change. Open at least one confirmation and one recovery link on a different device or private browser session.

Known limitation that remains: rider rows on a team led by someone else are linked only by email, so a confirmed email change does not update those rows automatically. An admin can fix them from the dashboard's email-sync dialog, and verified `profile_id` linking is still the planned long-term fix.

## Important limitation

The earlier live migrations were applied before this repository began tracking SQL consistently, so a fresh project still cannot be recreated completely from `git clone`. The registration draft and audit-hardening migrations are committed under `supabase/migrations/`; before production, pull the remaining live schema into reviewed migration files and test a clean database reset.
