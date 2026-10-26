# Review guide: live scoring, staff panels, vMix feed, paper registration

25–26 October 2026. For whoever reviews the pull request. The first four migrations (`20261025100000` to `20261025130000`) were applied to the live project on 26 October 2026 and a full signed-in rehearsal passed against it the same day (paper entry, draw, pools, call-up, scoring, undo, screens, feeds, cleanup); the fifth, `20261026100000_scoring_short_location`, is written and validated on a Postgres-in-WASM stand-in but not yet applied. Printed guides for staff, the graphics team and the rehearsal are in `public/documents/` (see README, "Printed guides"). Design: `docs/superpowers/specs/2026-10-25-live-scoring-design.md`. Setup and event-day steps: `docs/live-stream.md` and `docs/event-day-runbook.md`.

## What was built

| Area | Routes / pages | Main files |
| --- | --- | --- |
| Parents' names | solo and team forms, `/account`, admin edit, check-in desk | `20261025100000_rider_parent_names.sql`, `register/solo`, `register-team`, `AdminDashboard.tsx`, `CheckInPanel.tsx` |
| Staff roles | Profiles tab: player / judge / commentator / admin | `20261025110000_staff_roles.sql`, `api/admin/users`, `lib/scoring/auth.ts` |
| Live scoring data | (database only) | `20261025120000_live_scoring.sql`: 4 tables, 1 view, 25 functions |
| Judges | `/judge`, `POST /api/judge/{score,clear,status,live,call-pool}`, `GET /api/judge/state` | `app/judge/*` |
| Commentators | `/commentary`, `GET /api/commentary/state` | `app/commentary/*`, `lib/scoring/rider-detail.ts` |
| Admin scoring | `/admin/scoring`, `/api/admin/scoring/*` (rounds, start list, entrants, moves, pools, overrides, rider export) | `app/admin/scoring/*`, `lib/scoring/admin-state.ts` |
| Public | `/live`, `GET /api/live/state` | `app/live/*`, `components/scoring/*`, `lib/scoring/server.ts` |
| vMix feed | `GET /api/live/vmix/{current,leaderboard,entrants,rounds}` (`?format=csv`, `?sample=1`) | `lib/scoring/vmix*.ts` |
| Overlays (optional) | `/overlay` (setup page), `/overlay/{scorebug,lower-third,leaderboard,ticker,pool-call}` | `app/overlay/*` |
| Paper entry | `/register/paper` (PDFs), `/admin/paper`, `POST /api/admin/paper-registration` | `20261025130000_paper_registrations.sql`, `lib/paper-registration.ts`, `scripts/build-paper-forms.mts` |

## What each role sees

- **Public**: `/live` (scoreboard, pools, standings, podium once set), the overlays and the vMix feeds. Only what is announced: name, horse, team, home district. Never age, phone, email, parents or emergency contacts.
- **Judge**: `/judge` on a phone. Record Carried / Struck / Miss (confirm first), undo, skip, restore, call a pool, switch round, and a **Screens** sheet (display mode and message). Also `/commentary`.
- **Commentator**: `/commentary` — the rider on course with parents' names, home, horse, experience, headshot and today's runs.
- **Admin**: everything above plus `/admin/scoring` (rounds, draw, late entrants, pools, overrides, podium, pool sheet, Screens card, Clear live round, rider-list CSV) and `/admin/paper`.

## How to try it locally

1. Apply the migrations in the Supabase SQL editor of a **test** project, in exactly this order, each once:
   1. `20261025100000_rider_parent_names.sql`
   2. `20261025110000_staff_roles.sql`
   3. `20261025120000_live_scoring.sql`
   4. `20261025130000_paper_registrations.sql`

   Each one is idempotent and refuses to run out of order. Apply 1 before deploying the code: the forms and `/account` name the new columns.
2. Give your account the admin role, and a second account the judge role from the Profiles tab.
3. Check some riders in, open `/admin/scoring`, create "Qualification" (Single, 3 attempts, pool size 10), draw the start list, set it live, call Pool A.
4. Open `/judge` on a phone, `/live` and `/overlay/scorebug` side by side, and record results.
5. Without any of that, `GET /api/live/vmix/current?sample=1` (and the other three feeds) return rehearsal data.

## Verified, and how

- `npx tsc --noEmit`, `npm run lint`, `npm test` (139 tests), `npm run build`: all pass.
- **All 15 migrations against real Postgres 17 (PGlite)** over a stand-in of the live schema before this repo (NOT NULL `profile_id` / email, UNIQUE email and phone, owner RLS, column grants on `teams`). The July migrations ran verbatim, so the parents'-names patch was applied to the real `admin_mutate_registration` text. The four new files applied twice (idempotent) and refuse to run out of order. Smoke tests: paper solo without email (placeholder, code, no account); paper team of four; duplicate phone (refused, readable message); cross-entry same email (shares the code); parents' names round-trip; the check-in desk lookup; browser inserts under RLS (online solo and team paths still work; forged provenance is pinned to online); claiming a paper row by confirmed email; a registration in a start list cannot be deleted; qualification auto-void after a carry (pointer skips; undo restores); Screens and Clear live round. No client role can execute any new function; scoring tables are SELECT-only for clients; the override note is hidden.
- **Browser (dev server, live database without the new tables)**: every page shows its calm "not set up" state; overlays have a transparent body and no navbar/footer; `/judge`, `/commentary`, `/admin*` show their login screens; PDFs serve as `application/pdf`; all vMix feeds return one empty row (16 combinations of feed × sample × CSV checked); staff APIs answer 401 with `no-store`. With a mocked live state: `/live` at 375 px (no horizontal scroll), leaderboard and rider modes, a podium on the live round, and every overlay at 1920×1080 and 1280×720.

## Not verified

- Any signed-in flow: judge, commentator and admin panels with real data, role assignment, paper entry from the form, the rider export download, account linking of a paper rider. No credentials were used.
- Supabase-only behaviour: Realtime delivery and the `?v=` edge-cache key on Vercel, storage signed URLs for headshots, PostgREST error codes on the hosted project.
- The migrations against the live project itself (its exact constraint names and function text may differ from the stand-in; every file asserts its preconditions and fails loudly rather than half-applying).

## Things to look at closely

- `scoring_record_result` now voids a rider's remaining qualification attempts after a carry (`auto_voided_by`); clearing or changing that carry restores them.
- `/api/admin/registrations` and `/api/admin/users` no longer forward Postgres error text; deleting a rider who is in a start list now says so.
- Paper riders without email are stored under `no-email-…@paper.nezabazipunjab.com`. Never give that domain MX records.
- A paper rider without an email cannot also be entered in the other event (the phone check refuses it; the placeholder cannot be shared).
