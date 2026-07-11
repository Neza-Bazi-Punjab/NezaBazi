# Neza Bazi Punjab Championship 2026

Official website for the Neza Bazi Punjab Championship 2026 — the 1st open
tent-pegging championship, held **August 21, 2026 in Gurdaspur, Punjab** with
international participation.

Built with Next.js (App Router), TypeScript and Tailwind CSS v4 and Supabase (auth + database).

## Development

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint
npm run build
```
Requires a `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (see `.env.example`).

## Project roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Public website & design | ✅ Done |
| 2 | Supabase setup + player registration/login | Reviewing |
| 3 | Player profiles + event registration | In progress |
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
      solo/             Solo registration form (profile pre-filled) + success page
    register-team/      Team registration form (leader pre-filled) + server submit route + success page
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
  proxy.ts             Next.js 16 request entry point (formerly middleware.ts);
                       refreshes the Supabase session on every request
public/                Static assets: images/, flags/, brand/, documents/
```

Each component starts with a one-line comment describing what it does; shared
event details (date, venue, contact, domain) live in
[src/lib/site.ts](src/lib/site.ts) — the domain is currently a placeholder.

## Supabase setup

- **`profiles` table** — extends `auth.users` with `full_name`, `age`, `location`, `phone`, `years_experience`, `horse_age`, `horse_breed`, and `role` (`player`/`admin`). Protected by Row Level Security: users can only read/update their own row.
- **`solo_registrations` table** — one row per individual rider registration, linked to `profiles` via a unique `profile_id`. `email` and `phone` are also unique across the table, preventing duplicate registrations. Protected by Row Level Security: users can only read/update their own registration.
- **`teams` table** — one row per team, linked to its leader via a unique `leader_profile_id` (one team per leader). Protected by Row Level Security: only the leader can read/update their own team.
- **`team_members` table** — 4 rows per team (the leader + 3 riders), linked via `team_id`. `email` and `phone` are unique across the whole table, preventing the same person appearing on multiple teams. Protected by Row Level Security via a subquery checking the parent team's leader.
- **Auto-profile trigger** — `handle_new_user()` fires on every new `auth.users` signup and creates a matching `profiles` row automatically using the metadata submitted with the account.
- **Auth flow** — `/signup` creates an account (name, age, location, phone, email, password, years of experience, horse age, horse breed); `/login` signs in. Email confirmation is currently **off** for easier local testing — turn back on before public launch.
- **Registration flow** — `/register` lets a logged-in user choose solo or team registration. `/register/solo` pre-fills from their profile. `/register-team` pre-fills the leader's own details as Rider 1, and includes recovery handling if a team was partially created but not all members saved.

## Notes

- Contextual photos live in [public/images](public/images/README.md) and use
  the `DissolvePhoto` component, which masks their edges so they melt into the
  parchment background, echoing the poster.
- `/gallery` is a "coming soon" placeholder — match-day photography is added
  after the championship (August 21, 2026).
- `/players` and `/rankings` are still placeholder pages that unlock in later phases. `/login`, `/signup`, `/register`, `/register/solo`, and `/register-team` are all live.

- The logo mark comes from [public/brand](public/brand/README.md); the
  favicon is a derived single-tone version at [src/app/icon.svg](src/app/icon.svg).
- `/rules` embeds a PDF from `public/documents/rules.pdf` when present (see
  [public/documents/README.md](public/documents/README.md)), otherwise it shows
  a "coming soon" placeholder.
