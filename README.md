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
npm run build:forms   # regenerate the printable registration PDFs (see Live scoring)
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
| 4 | Admin dashboard + score entry | Built — live scoring, judges' and commentary panels, stream overlays, paper registration. Pending: the five new migrations on the live project, then an event-day rehearsal |
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
      paper/            Printable paper forms (solo and team PDFs) and where to hand them in
    register-team/      Team registration wizard (Team name → Riders 1–4 → Review,
                        progress bar + autosaved draft) + server submit route + success page
    api/locations/      Server-only location data: states/ serves the vendored
                        country→state list, search/ proxies GeoNames village search
    account/            Logged-in user's own account info (view/edit) + active registrations
    admin/              Admin-only dashboard: view/search/edit/delete solo & team
                        registrations, check-in, staff roles
      scoring/          Rounds, start-list draws, pools, late entrants, overrides,
                        podium and the printable pool sheet
      paper/            Key in a paper registration form on a rider's behalf
    live/               Public live scoreboard: on course, up next, standings, pools
    judge/              Judges' panel (phone): record results, call pools, undo
    commentary/         Commentary panel: rider background for the announcer
    overlay/            Transparent stream overlays (scorebug, lower-third,
                        leaderboard, ticker, pool-call) + a setup page
    api/live/           Public live state and the four vMix data feeds (no personal data)
    api/judge/          Judge writes: score, clear, skip/restore, live pointer, call pool
    api/commentary/     Staff-only commentary state (reads rider background)
    api/admin/scoring/  Admin scoring writes (rounds, start lists, entrants, pools, overrides)
                        and the rider-list export for the graphics team
    api/admin/paper-registration/  Admin paper entry and the duplicate search
    api/admin/users/    Server-only route for listing user accounts, assigning staff
                        roles and deleting accounts (uses the Supabase service role key)
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
    SiteChrome.tsx      Hides the navbar and footer on /judge, /commentary, /overlay
    scoring/            Shared live-scoring UI: leaderboard table, rosters, badges
  data/                 Vendored GeoNames reference data (countries.json,
                        states.json) for the location picker dropdowns
  lib/
    site.ts            Single source of truth for event details, nav links
    registration-drafts.ts  Client hook + helpers for registration autosave drafts
    paper-registration.ts  Paper form field list, validation and placeholder-email rules
    scoring/
      types.ts          Shared live-scoring vocabulary: rows, payloads, pool sizing
      auth.ts           Role checks for the staff panels and scoring routes
      server.ts         Assembles the public, judge and commentary states
      rider-detail.ts   Rider background for commentators (the only scoring module
                        that reads registration tables)
      vmix.ts           Flat rows for the vMix data sources
      vmix-columns.ts   The feeds' column lists (also shown on /overlay)
      vmix-sample.ts    Fixed rehearsal data for ?sample=1
      use-live-state.ts Client hook: Realtime subscription with polling fallback
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
docs/                  Plain-English notes for teammates
  supabase-changes.md  Every database migration and why
  vmix-data-feed.md    Handout for the graphics team: the feeds, columns, rehearsal
  live-stream.md       Data feeds, bridge script, overlays, OBS, troubleshooting,
                       and applying the live-scoring migrations
  event-day-runbook.md Step by step for organisers, judges and commentators
scripts/
  build-paper-forms.mts  Generates the printable registration PDFs (npm run build:forms)
  vmix-bridge.mjs      Pushes the live feed into a vMix title (stream team, optional)
supabase/migrations/   Committed SQL migrations (from registration_drafts onward)
public/                Static assets: images/, flags/, brand/, documents/
```

Each component starts with a one-line comment describing what it does; shared
event details (date, venue, contact, domain) live in
[src/lib/site.ts](src/lib/site.ts); the production domain is
`https://www.nezabazipunjab.com`.

## Supabase setup

- **Auth is the source of truth** — `full_name`, `age`, `location`, `phone`, and `email` are stored and read directly from Supabase Auth (`auth.users.user_metadata` and `auth.users.email`), not from a separate `profiles` table. This keeps account info consistent across signup, `/account`, registration prefill, and the navbar.
- **`profiles` table** — trimmed to just `id`, `role` (`player`, `judge`, `commentator` or `admin`), `created_at`, and `updated_at`. Its only jobs are tracking who's staff and giving `solo_registrations`/`teams` a stable `id` to link against. Protected by Row Level Security via a recursion-safe `is_admin()` helper function.
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
- **Admin dashboard** — `/admin` (role-gated) lets admins search, view, inline-edit, and delete solo and team registrations, run rider check-in, and manage staff (assign the judge, commentator or admin role, or delete an account) via server-only API routes using the Supabase service role key. Admins have no direct write access to the registration tables: the broad admin RLS policies were removed, so every edit, delete and check-in goes through a server route into a transactional database function that commits the data change and its audit record together. The audit actor is derived from the verified server session, so actor fields sent by the browser are ignored.

The live database changes are documented in [docs/supabase-changes.md](docs/supabase-changes.md). The earlier changes were applied to the current Supabase project and verified there but are not yet a source-controlled migration set; new migrations (starting with `registration_drafts`) are committed under `supabase/migrations/` as they are applied.

## Live scoring

On event day judges record every run from a phone, and a public scoreboard, a commentary panel and the stream graphics follow within about a second. The step-by-step guide for organisers, judges and commentators is [docs/event-day-runbook.md](docs/event-day-runbook.md); the graphics team's handout is [docs/vmix-data-feed.md](docs/vmix-data-feed.md), and the fuller stream guide is [docs/live-stream.md](docs/live-stream.md).

**Roles.** `profiles.role` is one of `player`, `judge`, `commentator` or `admin`, assigned by an administrator from the Profiles tab (**Add Staff**). Every staff page and scoring route reads the caller's role on the server from their own `profiles` row; nothing the browser sends can raise it.

| Route | Who | What it does |
| --- | --- | --- |
| `/admin/scoring` | admin | Create rounds, draw start lists into pools, add late entrants, move riders, print the pool sheet, set a round live or clear it, call pools, choose what the screens show, advance overrides, podium, download the rider list |
| `/judge` | judge, admin | Record a result in two taps (Carried 4 / Struck 2 / Miss 0), undo, change, skip, call the next pool, choose what the screens show |
| `/commentary` | judge, commentator, admin | The rider on course with their background (parents' names, home, horse, experience, today's runs), up next, standings |
| `/live` | everyone | Public scoreboard: on course, last result, up next, standings, a "find your pool" list |
| `/api/live/vmix/current`, `leaderboard`, `entrants`, `rounds` | everyone | Flat JSON/CSV rows for vMix Data Sources: the rider on course, standings, start lists with progress, every round. `?sample=1` gives fixed rehearsal data |
| `/api/live/state` | everyone | The full live state as JSON, for other graphics systems |
| `/overlay/*` | everyone | Optional ready-made transparent 1920×1080 graphics for browser inputs; `/overlay` explains the feeds and the setup |
| `/api/admin/scoring/export` | admin | The rider list for the graphics team (CSV): no phone, email, age, parents or emergency contacts |
| `/admin/paper`, `/register/paper` | admin / everyone | Key in a printed registration form; download the forms |

**How pools work.** A round's start list is drawn from the riders who have actually checked in (or, for later rounds, those marked through in the previous round), in a random order, and split into balanced pools of about the round's pool size — 25 riders at a pool size of 10 make pools of 9, 8 and 8 (`balancedPoolSizes` in `src/lib/scoring/types.ts`, mirrored exactly in SQL). Pools ride one after another; within a pool everyone rides attempt 1, then attempt 2, then attempt 3, and a Section team's four riders ride back to back. "Call Pool B" switches every screen to Pool B's roster with "get ready" until the first result. A late entrant joins the smallest pool and rides last in it. Results are worth carry 4, strike 2, miss 0, computed by the database, never sent by the browser: Single goes on the best run and a carry goes through (in the qualification it also skips the rider's remaining attempts, and undoing the carry brings them back); Section adds the four riders' runs and goes through on the round's target (8, 12, then 16). Judges and administrators choose what the screens show — scoreboard, standings, the rider alone, the pool call-up, a message, or blank — and `/live` and the overlays follow.

**Public versus staff data.** Everything public — `/live`, the overlays, the vMix feeds and `/api/live/state` — is assembled through the anonymous role from the `scoring_*` tables and the `scoring_leaderboard` view only. Each run carries a snapshot of what is announced over the PA (name, horse, team, home district and state; never the village, which `20261026100000_scoring_short_location` strips before the row is stored), so no public surface reads a registration table. Parents' names, ages, experience and headshots reach only `/api/commentary/state`, which checks the staff role, reads through the service role and is never cached. The scoring tables are read-only to browsers: every write goes through a service-role database function that locks the row, validates the change and writes its audit record in the same transaction. The whole site refuses to be framed by other websites (`X-Frame-Options: DENY`); vMix and OBS browser inputs are not frames, so the overlays work there. Open pages update within about a second through Supabase Realtime (each refetch carries `?v=<commit timestamp>`, so the one-second edge cache never answers with the copy from before the write), keep working when Realtime drops (they poll), and show a calm "not set up yet" state before the migrations are applied.

**Data feeds and rehearsal.** The four `/api/live/vmix/*` feeds always send every column (empty string or 0, never missing) and one empty row when there is nothing to show, so vMix bindings never break. Their column lists live in `src/lib/scoring/vmix-columns.ts`. `?sample=1` answers from `src/lib/scoring/vmix-sample.ts` without touching the database, with `sample` = `Yes` on every row, so the graphics team can build and rehearse titles before event day. The rider list export at `/admin/scoring` is the one file meant to leave the building with rider details; it carries district and state but no full address, no contact or family details, and no confirmation codes (those are check-in credentials and stay with the organisers).

**Training mode.** `/judge/demo` and `/commentary/demo` run the real panels against an in-memory practice session (`src/lib/scoring/sample-session.ts`; the judges' rules are re-implemented from the SQL functions in `sample-engine.ts` and tested in `sample-engine.test.mts`). On the live site any signed-in judge, commentator or administrator gets their own session, keyed by user id (at most 200 kept, each dropped after 6 hours idle). With `SCORING_SAMPLE_MODE=1` in `.env.local`, a practice laptop needs no login and everyone shares one session, which `/live?sample=1` follows. Without the variable, an anonymous `?sample=1` gets the same 401 as before. Steps: [docs/event-day-runbook.md](docs/event-day-runbook.md), section 9.

**Migrations.** Five new files under `supabase/migrations/` are applied by hand in the Supabase SQL editor, in order: `20261025100000_rider_parent_names`, `20261025110000_staff_roles`, `20261025120000_live_scoring`, `20261025130000_paper_registrations`, `20261026100000_scoring_short_location`. The first must be applied before this code goes live, because registration and `/account` read and write the new parents' name columns. The fifth can be applied any time after the third, and before any start list is drawn: until then the public scoring table and its realtime events carry each rider's full registered address (the API shortens it to district and state either way). Steps and verification queries: [docs/live-stream.md](docs/live-stream.md), section 5. What each does and why: [docs/supabase-changes.md](docs/supabase-changes.md), items 17–21.

**Paper forms.** `npm run build:forms` (Node 24) regenerates `public/documents/registration-form-solo.pdf` and `registration-form-team.pdf` from `src/lib/site.ts` and the field list in `src/lib/paper-registration.ts`. It downloads Noto Sans Gurmukhi into `scripts/fonts/` on first run (not committed) for the Punjabi labels, and still builds English-only if the download fails. The PDFs are committed. Rebuilds are not byte-identical, so rebuild only when the form changes and never in CI. A rider without email is stored under a placeholder on `paper.nezabazipunjab.com`; that domain must never receive mail (no MX records).

**Printed guides.** `npm run build:guide` (Node 24) builds the three PDFs in `public/documents/` that are linked from the admin dashboard's tab bar: `staff-guide.pdf` (how the live scoring works, by role) from `docs/superpowers/plans/2026-10-25-staff-guide-outline.md`, `vmix-guide.pdf` (the graphics team's handout) from `docs/vmix-data-feed.md`, and `rehearsal-guide.pdf` (how to practise alone and run a dress rehearsal) from `docs/superpowers/plans/2026-10-26-rehearsal-guide-outline.md`. The text files are the source: edit one, rebuild, and commit both the text and the PDF. The dialect (headings, steps, tables, callouts, pictures, `{site.*}` placeholders) is described at the top of the staff-guide outline.

**vMix bridge.** `node scripts/vmix-bridge.mjs --input "<title>"` is an optional, dependency-free script that pushes the current feed into a vMix title through vMix's local API (`--sample` for rehearsal data); see [docs/live-stream.md](docs/live-stream.md).

## Notes

- Contextual photos live in [public/images](public/images/README.md) and use
  the `DissolvePhoto` component, which masks their edges so they melt into the
  parchment background, echoing the poster.
- `/players` and `/rankings` are still placeholder pages that unlock in later phases. `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/register`, `/register/solo`, `/register/paper`, `/register-team`, `/account`, `/admin`, `/admin/scoring`, `/admin/paper`, `/live`, `/judge`, `/commentary` and `/overlay` are all live in the code; the scoring pages show "not set up yet" until their migrations are applied.
- The navbar links only Home, Event and Rulebook ([src/lib/site.ts](src/lib/site.ts)); the
  account, registration and admin pages are reached from the footer, the CTAs, or
  directly by URL. `/live` is linked from the footer ("Live Scores"), not the navbar.
  The staff panels and overlays are left out of the sitemap and marked `noindex`.
- `npm test` runs Node's built-in test runner over the `.test.mts` files. These are
  source-text assertions, not behavioral tests — they read the component, route and
  migration files and match against them, so they lock in specific code and SQL
  patterns. Expect to update a test when you intentionally change one.

- The logo mark comes from [public/brand](public/brand/README.md); the
  favicon is a derived single-tone version at [src/app/icon.svg](src/app/icon.svg).
- `/rules` embeds a PDF from `public/documents/rules.pdf` when present (see
  [public/documents/README.md](public/documents/README.md)), otherwise it shows
  a "coming soon" placeholder.
