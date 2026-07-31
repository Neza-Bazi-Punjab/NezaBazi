# Neza Bazi Punjab Championship 2026

Official website for the Neza Bazi Punjab Championship 2026 — the 1st open
tent-pegging championship, held **November 11, 2026 in Amritsar, Punjab** with
international participation. 150+ riders compete for the Amritsar Cup.

Event details (date, venue, cup name, prize, contact) are not duplicated here —
[src/lib/site.ts](src/lib/site.ts) is the single source of truth.

Built with Next.js (App Router), TypeScript and Tailwind CSS v4 and Supabase (auth + database).

## Development

```bash
npm install
npm run dev      # http://localhost:3000
npm test
npm run lint
npm run build
```
Requires a `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the server-only `SUPABASE_SERVICE_ROLE_KEY` (see `.env.example`). The optional server-only `GEONAMES_USERNAME` (free account at geonames.org with "free web services" enabled) powers the village autocomplete in the location picker; without it the picker falls back to manual entry.

`RESEND_API_KEY` (server-only) sends the registration confirmation-code emails. This is **not** the same as the Resend SMTP settings in the Supabase dashboard: those cover Auth emails (confirm signup, password reset) rendered from Supabase's own templates and cannot send application email. While the key is unset, registration still succeeds and the code is shown on-screen and on `/account` — only the email is skipped, with a warning in the server log. `RESEND_FROM_EMAIL` overrides the sender, which must be on a domain verified in Resend.

> **`.env.example` is committed — keep its values empty.** It is the one `.env*`
> file `.gitignore` does not ignore, so a real key pasted there is published on the
> next commit. Real values belong in `.env.local` (ignored) and, for deploys, in the
> Vercel environment settings. `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level
> Security entirely — treat it like a database password.

## Project roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Public website & design | ✅ Done |
| 2 | Supabase setup + player registration/login | Reviewing |
| 3 | Player profiles + event registration + admin dashboard | In progress — registration, account management, and admin tools live; /players is still a placeholder |
| 4 | Admin dashboard + score entry | Planned |
| 5 | Rankings/stats + audit log & security review | Planned |

## Project structure

```
src/
  app/                 App Router routes (one folder per page)
    layout.tsx         Root layout: fonts, <Navbar>, <Footer>, metadata
    page.tsx           Home page
    globals.css        Tailwind v4 theme (@theme) + shared animation tokens
    event/ rules/      Content pages (/about permanently redirects to /event)
    login/ signup/     Working auth pages (Supabase)
    forgot-password/ reset-password/   Self-service password reset
    auth/confirm/      Route handler that verifies emailed one-time tokens
    auth/auth-code-error/   Failure page for expired or invalid auth links
    register/           Registration chooser page (solo vs team)
      solo/             Solo registration form (Auth-prefilled, autosaved draft) + success page
    register-team/      Team registration wizard (Team name → Riders 1–4 → Review,
                        progress bar + autosaved draft) + server submit route + success page
    api/locations/      Server-only location data: states/ serves the vendored
                        country→state list, search/ proxies GeoNames village search
    account/            Logged-in user's own account info (view/edit) + active registrations
    admin/              Admin-only dashboard: view/search/edit/delete solo & team
                        registrations, manage admin users
    api/admin/users/    Server-only route for listing/promoting/demoting/
                        deleting user accounts (uses the Supabase service role key)
    api/admin/registrations/  Server-only route for admin registration edits and
                        deletes; calls a transactional DB function that writes the
                        change and its audit record together
    api/admin/check-in/  Server-only rider check-in: look a rider up by the code
                        they present, then record their arrival through the same
                        audited database path
    api/registration/confirmation-code/  Emails the caller their own solo
                        confirmation code after registration
    api/account/profile/ Server-only account update and registration-sync route
    players/ rankings/  "Coming soon" pages, unlock in later phases
    sitemap.ts icon.svg
  components/           Reusable UI (Navbar, Footer, Button, DissolvePhoto,
                        Reveal, icons, LocationPicker, section building blocks, …)
  data/                 Vendored GeoNames reference data (countries.json,
                        states.json) for the location picker dropdowns
  lib/
    site.ts            Single source of truth for event details, nav links
    registration-drafts.ts  Client hook + helpers for registration autosave drafts
    safe-redirect.ts   Sanitizes ?redirect= into same-origin internal paths only
    email/
      resend.ts         Server-only Resend send helper; skips rather than throws
                        when RESEND_API_KEY is unset
      registration-code.ts  Confirmation-code email content
    sync-account-registrations.ts  Client-side trigger for the account sync route
    admin/
      server.ts         Admin request verification, service-role client, audit writes
      audit.ts          Builds server-trusted audit records; forged actor fields lose
    supabase/
      client.ts         Supabase client for Client Components (browser)
      server.ts          Supabase client for Server Components/Actions
      middleware.ts       Session-refresh helper, used by proxy.ts
      email-confirmation.ts  Confirmed-email check used by every registration path
      query.ts            Escapes PostgREST ILIKE wildcards in identity lookups
      sync-registration-profile.ts  Server-only service-role registration sync
  proxy.ts             Next.js 16 request entry point (formerly middleware.ts);
                       refreshes the Supabase session on every request
docs/                  Plain-English Supabase migration and setup notes
supabase/migrations/   Committed SQL migrations (from registration_drafts onward)
public/                Static assets: images/, flags/, brand/, documents/
```

Each component starts with a one-line comment describing what it does; shared
event details (date, venue, contact, domain) live in
[src/lib/site.ts](src/lib/site.ts); the production domain is
`https://www.nezabazipunjab.com`.

## Supabase setup

- **Auth is the source of truth** — `full_name`, `age`, `location`, `phone`, and `email` are stored and read directly from Supabase Auth (`auth.users.user_metadata` and `auth.users.email`), not from a separate `profiles` table. This keeps account info consistent across signup, `/account`, registration prefill, and the navbar.
- **`profiles` table** — trimmed to just `id`, `role` (`player`/`admin`), `created_at`, and `updated_at`. Its only jobs are tracking who's an admin and giving `solo_registrations`/`teams` a stable `id` to link against. Protected by Row Level Security via a recursion-safe `is_admin()` helper function.
- **`solo_registrations` table** — one row per individual rider registration, linked via `profile_id`. A database trigger prevents a regular player from creating a second solo entry. `email` and `phone` are also unique across the table, preventing duplicate registrations. Admins are exempt from the one-per-person rule for testing purposes; `email`/`phone` uniqueness still applies to everyone.
- **`teams` table** — one row per team, linked to its leader via `leader_profile_id`. A database trigger prevents a regular player from creating a second team; admins are exempt for testing. `team_members` holds 4 rows per team (the leader + 3 riders); `email` and `phone` are unique across the whole table so the same person can't appear on multiple teams. Deleting a team cascades to delete its members automatically.
- **Auto-profile trigger** — `handle_new_user()` fires on every new `auth.users` signup and creates a bare `profiles` row (just the `id`) — all other account fields go straight into Auth metadata instead.
- **Auth flow** — `/signup` creates an account (name, age, location, phone, email, password, years of experience, horse age, horse breed), saved directly to Auth. `/login` signs in, and supports a `?redirect=` parameter (sanitized to internal paths only) so gated pages return the user where they came from. The app is ready for email confirmation through Resend: signup shows a "check your inbox" page, the emailed link is verified by the `/auth/confirm` route handler, and `/forgot-password` + `/reset-password` provide self-service password reset. The production dashboard settings still need to be verified separately; see [docs/supabase-changes.md](docs/supabase-changes.md).
- **Registration flow** — `/register` lets a logged-in user choose solo or team registration, both pre-filled from their Auth account info (locked/read-only for regular users). A regular player already listed on any team is blocked from registering another team, and all four rider emails/phones are checked before a new team is created; admins retain the testing bypass for their own registration limits.
- **Registration drafts** — the `registration_drafts` table (owner-only RLS, one row per user per type) autosaves the solo form and the team wizard ~1s after each change, so a half-finished registration survives logout and device switches. The team form is a step wizard (Team name → Riders 1–4 → Review & Submit) with a progress bar; drafts are deleted on successful submission. Full validation still runs only in the submit route.
- **Location picker** — every location field uses a guided picker: country + state dropdowns from vendored GeoNames data (`src/data/`), village autocomplete (3+ chars, 300ms debounce, 5 suggestions) via a server route that proxies GeoNames with `GEONAMES_USERNAME`, then an editable nearby city/district. Saves one combined string, e.g. `Ladhewali, Jalandhar, Punjab, India`, into the existing `location` columns. Manual entry is always available and is the automatic fallback while `GEONAMES_USERNAME` is unset. Location data © GeoNames, CC BY 4.0.
- **Account management** — `/account` lets a logged-in user view and edit their own info and see their active solo/team registration status. Saves go through a server route (`/api/account/profile`) that updates Auth via the user's own session, then uses the service role to sync account details onto the user's registration rows — their solo registration (linked by `profile_id`) and any `team_members` rows matching their previous login email, including rows on teams someone else leads. Signup triggers the same sync immediately when a session is available, and login retries it for confirmation-enabled accounts. Registration emails only follow the login email when they still matched the old one, so admin-set overrides are preserved; unique-constraint conflicts surface as warnings without blocking the account update.
- **Confirmation codes** — every rider gets a unique `NBP-XXXXXX` code the moment they register: solo entrants and all four riders on a team, one code each. The code belongs to the **rider, not the entry** — someone who enters solo *and* rides on a team holds a single code covering both, matched on their email address. Checking that code in marks every entry they hold as arrived at once, so a rider standing at the desk can never show as present on one entry and absent on the other. The code is generated by a database trigger, not by app code, so the browser cannot choose or forge one; `confirmation_code`, `checked_in_at` and `checked_in_by` are excluded from the `authenticated` UPDATE grant, so only the audited admin route can write them. Codes are random rather than sequential — a sequential number would leak the registration count and let a stranger guess a valid one — and they are unique across both registration tables because the check-in desk types one code and searches both. The alphabet omits `O/0`, `I/1` and `U` so codes survive being read aloud.
- **Check-in** — riders check in on the day before the event (`site.checkInDate`). An admin opens the Check-in tab, types the code, sees the rider's full record and — for a team rider — how many of the four have arrived, then confirms. Only checked-in riders are eligible for the brackets, and a team needs all four. Re-scanning an already-checked-in rider fails loudly rather than overwriting the original arrival time; undo is available and audited like any other admin action. A rider who never received their email can be found by name, email or phone instead; selecting a match loads the same record, since codes are unique.
- **Team rider emails** — riders 2–4 are entered by their leader and may have no account here, so their email carries the code, the team name and the rider names, and tells them to sign in with that address (or create an account with it) to check or correct their own details. Teammates' phone numbers and email addresses are deliberately left out — the leader supplied those, and the riders never agreed to have them forwarded. This leans on the email address as the rider's identity, which is the deliberate design: a rider claims their entry by signing in with that address and confirming it, and a confirmed email is what every registration path checks.
- **Admin dashboard** — `/admin` (role-gated) lets admins search, view, inline-edit, and delete solo and team registrations, run rider check-in, and manage other admins (promote/demote/delete) via server-only API routes using the Supabase service role key. Admins have no direct write access to the registration tables: the broad admin RLS policies were removed, so every edit, delete and check-in goes through a server route into a transactional database function that commits the data change and its audit record together. The audit actor is derived from the verified server session, so actor fields sent by the browser are ignored.

The live database changes are documented in [docs/supabase-changes.md](docs/supabase-changes.md). The earlier changes were applied to the current Supabase project and verified there but are not yet a source-controlled migration set; new migrations (starting with `registration_drafts`) are committed under `supabase/migrations/` as they are applied.

## Notes

- Contextual photos live in [public/images](public/images/README.md) and use
  the `DissolvePhoto` component, which masks their edges so they melt into the
  parchment background, echoing the poster.
- `/players` and `/rankings` are still placeholder pages that unlock in later phases. `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/register`, `/register/solo`, `/register-team`, `/account`, and `/admin` are all live.
- The navbar links only Home, Event and Rulebook ([src/lib/site.ts](src/lib/site.ts)); the
  account, registration and admin pages are reached from the footer, the CTAs, or
  directly by URL.
- `npm test` runs Node's built-in test runner over the `.test.mts` files. These are
  source-text assertions, not behavioral tests — they read the component, route and
  migration files and match against them, so they lock in specific code and SQL
  patterns. Expect to update a test when you intentionally change one.

- The logo mark comes from [public/brand](public/brand/README.md); the
  favicon is a derived single-tone version at [src/app/icon.svg](src/app/icon.svg).
- `/rules` embeds a PDF from `public/documents/rules.pdf` when present (see
  [public/documents/README.md](public/documents/README.md)), otherwise it shows
  a "coming soon" placeholder.
