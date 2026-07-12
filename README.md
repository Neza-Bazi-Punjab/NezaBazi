# Neza Bazi Punjab Championship 2026

Official website for the Neza Bazi Punjab Championship 2026 — the 1st open
tent-pegging championship, held **August 21, 2026 in Gurdaspur, Punjab** with
international participation.

Built with Next.js (App Router), TypeScript and Tailwind CSS v4 and Supabase (auth + database).

## Development

```bash
npm install
npm run dev      # http://localhost:3000
npm test
npm run lint
npm run build
```
Requires a `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the server-only `SUPABASE_SERVICE_ROLE_KEY` (see `.env.example`).

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
    about/ event/ gallery/ rules/ contact/    Content pages
    login/ signup/     Working auth pages (Supabase)
    register/           Registration chooser page (solo vs team)
      solo/             Solo registration form (Auth-prefilled) + success page
    register-team/      Team registration form (Auth-prefilled leader) + server submit route + success page
    account/            Logged-in user's own account info (view/edit) + active registrations
    admin/              Admin-only dashboard: view/search/edit/delete solo & team
                        registrations, manage admin users
    api/admin/users/    Server-only route for listing/promoting/demoting/
                        deleting user accounts (uses the Supabase service role key)
    api/account/profile/ Server-only account update and registration-sync route
    players/ rankings/  "Coming soon" pages, unlock in later phases
    sitemap.ts icon.svg
  components/           Reusable UI (Navbar, Footer, Button, DissolvePhoto,
                        Reveal, icons, section building blocks, …)
  lib/
    site.ts            Single source of truth for event details, nav links
    supabase/
      client.ts         Supabase client for Client Components (browser)
      server.ts          Supabase client for Server Components/Actions
      middleware.ts       Session-refresh helper, used by proxy.ts
      sync-registration-profile.ts  Server-only service-role registration sync
  docs/                  Plain-English Supabase migration and setup notes
  proxy.ts             Next.js 16 request entry point (formerly middleware.ts);
                       refreshes the Supabase session on every request
public/                Static assets: images/, flags/, brand/, documents/
```

Each component starts with a one-line comment describing what it does; shared
event details (date, venue, contact, domain) live in
[src/lib/site.ts](src/lib/site.ts) — the domain is currently a placeholder.

## Supabase setup

- **Auth is the source of truth** — `full_name`, `age`, `location`, `phone`, and `email` are stored and read directly from Supabase Auth (`auth.users.user_metadata` and `auth.users.email`), not from a separate `profiles` table. This keeps account info consistent across signup, `/account`, registration prefill, and the navbar.
- **`profiles` table** — trimmed to just `id`, `role` (`player`/`admin`), `created_at`, and `updated_at`. Its only jobs are tracking who's an admin and giving `solo_registrations`/`teams` a stable `id` to link against. Protected by Row Level Security via a recursion-safe `is_admin()` helper function.
- **`solo_registrations` table** — one row per individual rider registration, linked via `profile_id`. A database trigger prevents a regular player from creating a second solo entry. `email` and `phone` are also unique across the table, preventing duplicate registrations. Admins are exempt from the one-per-person rule for testing purposes; `email`/`phone` uniqueness still applies to everyone.
- **`teams` table** — one row per team, linked to its leader via `leader_profile_id`. A database trigger prevents a regular player from creating a second team; admins are exempt for testing. `team_members` holds 4 rows per team (the leader + 3 riders); `email` and `phone` are unique across the whole table so the same person can't appear on multiple teams. Deleting a team cascades to delete its members automatically.
- **Auto-profile trigger** — `handle_new_user()` fires on every new `auth.users` signup and creates a bare `profiles` row (just the `id`) — all other account fields go straight into Auth metadata instead.
- **Auth flow** — `/signup` creates an account (name, age, location, phone, email, password, years of experience, horse age, horse breed), saved directly to Auth. `/login` signs in, and supports a `?redirect=` parameter (sanitized to internal paths only) so gated pages return the user where they came from. Email confirmation is currently **off** for easier local testing — turn back on before public launch.
- **Registration flow** — `/register` lets a logged-in user choose solo or team registration, both pre-filled from their Auth account info (locked/read-only for regular users). A regular player already listed on any team is blocked from registering another team, and all four rider emails/phones are checked before a new team is created; admins retain the testing bypass for their own registration limits.
- **Account management** — `/account` lets a logged-in user view and edit their own info and see their active solo/team registration status. Saves go through a server route (`/api/account/profile`) that updates Auth via the user's own session, then uses the service role to sync account details onto the user's registration rows — their solo registration (linked by `profile_id`) and any `team_members` rows matching their previous login email, including rows on teams someone else leads. Signup triggers the same sync immediately when a session is available, and login retries it for confirmation-enabled accounts. Registration emails only follow the login email when they still matched the old one, so admin-set overrides are preserved; unique-constraint conflicts surface as warnings without blocking the account update.
- **Admin dashboard** — `/admin` (role-gated) lets admins search, view, inline-edit, and delete solo and team registrations, and manage other admins (promote/demote/delete) via a server-only API route using the Supabase service role key.

The live database changes are documented in [docs/supabase-changes.md](docs/supabase-changes.md). They were applied to the current Supabase project and verified there; they are not yet a source-controlled migration set for recreating a fresh project.

## Notes

- Contextual photos live in [public/images](public/images/README.md) and use
  the `DissolvePhoto` component, which masks their edges so they melt into the
  parchment background, echoing the poster.
- `/gallery` is a "coming soon" placeholder — match-day photography is added
  after the championship (August 21, 2026).
- `/players` and `/rankings` are still placeholder pages that unlock in later phases. `/login`, `/signup`, `/register`, `/register/solo`, `/register-team`, `/account`, and `/admin` are all live.

- The logo mark comes from [public/brand](public/brand/README.md); the
  favicon is a derived single-tone version at [src/app/icon.svg](src/app/icon.svg).
- `/rules` embeds a PDF from `public/documents/rules.pdf` when present (see
  [public/documents/README.md](public/documents/README.md)), otherwise it shows
  a "coming soon" placeholder.
