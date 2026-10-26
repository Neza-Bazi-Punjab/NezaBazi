# Live scoring, judges' panel, commentary panel, stream overlays, pools, parents' names

Design spec, 25 October 2026. This is the contract every implementation task
builds against. The shared TypeScript vocabulary is already in
`src/lib/scoring/types.ts`; role checks are in `src/lib/scoring/auth.ts`. Read
both before starting, and do not change exported names or shapes in either —
other tasks import them in parallel. Adding is fine; renaming is not.

## 1. Goals

On event day (11 November 2026) the site must:

1. Let judges at the track record every run's result from a phone in two taps.
2. Show a live public scoreboard (`/live`) that updates within a second or two.
3. Give commentators a panel (`/commentary`) that tells them who is on course,
   who is up next, how each rider has done today, and the rider's background
   (parents' names, home village, horse, experience) in large type.
4. Feed the live stream: transparent browser-source overlays (`/overlay/*`) for
   OBS, vMix, Streamlabs, Wirecast or any software with a web/browser source,
   plus a JSON endpoint (`/api/live/state`) for software that prefers data
   sources (vMix Data Sources, Singular.live, CasparCG templates).
5. Draw riders into balanced, randomized pools (Pool A, Pool B, …, about 10 per
   pool) and rank them per pool and per round.
6. Record each rider's father's and mother's name at registration.

Registrations keep arriving right up to check-in (the day before the event), so
nothing is frozen in advance: start lists are drawn from the riders who have
actually checked in, late entrants can be appended to the smallest pool after a
draw, and a start list can be rebuilt freely until a result has been recorded.

"Bulletproof" is the brief. Concretely: every write goes through a
service-role-only Postgres function that locks the row, validates the
transition and writes its audit record in the same transaction; the public
surface carries no personal data beyond what is announced over the PA; every
panel keeps working when realtime drops (polling fallback) and renders a calm
state when the scoring tables do not exist yet; two judges cannot both score
the same run without one of them explicitly overriding; every route checks the
caller's role server-side.

## 2. Competition format (from `/event`)

**Single Tent Pegging** (`event_type = 'single'`). Entrants are solo
registrations. Qualification (round 0): three attempts per rider; one carried
peg advances. Aarhi knockout rounds (1, 2, …): one attempt per rider; only a
carry advances. The final round decides 1st–3rd (administrator records the
podium).

**Section Tent Pegging** (`event_type = 'section'`). Entrants are teams of four;
one run per rider per round; the four scores are summed. Targets: 8 points in
round 1, 12 in round 2, 16 (Full House) from round 3 on.

**Results and points**: `carry` = 4, `strike` = 2, `miss` = 0. The database
computes points from the result; the browser never sends points.

**Pools**: a round may be split into pools of about `pool_size` entrants
(riders for Single, teams for Section). The number of pools is
`ceil(entrants / pool_size)` and sizes differ by at most one
(`balancedPoolSizes` in types.ts is the reference; the SQL must produce the
same sizes). Pools are labelled A, B, C, … in draw order. Pools ride one after
another: all of Pool A's runs, then Pool B's. Within a pool, attempt 1 for every
entrant, then attempt 2, then attempt 3 (passes). A Section team's four riders
ride consecutively within a pass, leader first then roster order.

## 3. Roles

`profiles.role` becomes one of `player | judge | commentator | admin`.
Administrators assign roles from the existing Profiles tab. Nothing about
`is_admin()` changes. Capabilities:

| Capability | judge | commentator | admin |
| --- | --- | --- | --- |
| Open `/judge`, record / clear / void results, move the live pointer | ✓ | | ✓ |
| Open `/commentary`, read rider detail (parents, age, experience, headshot) | ✓ | ✓ | ✓ |
| Create rounds, draw start lists, pools, overrides, podium (`/admin/scoring`) | | | ✓ |
| Everything under `/admin` today | | | ✓ |

## 4. Data model

All new tables live in `public`, have RLS enabled, and are **read-only from the
browser**: `grant select` to `anon` and `authenticated` with a permissive
`using (true)` SELECT policy; no INSERT/UPDATE/DELETE grant or policy for any
client role; `service_role` keeps full access. Writes happen only through the
functions in §5.

```sql
create table public.scoring_rounds (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('single','section')),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  round_number integer not null check (round_number between 0 and 50),
  attempts_per_rider integer not null default 1 check (attempts_per_rider between 1 and 3),
  target_points integer check (target_points is null or target_points between 1 and 16),
  status text not null default 'upcoming' check (status in ('upcoming','live','complete')),
  sort_order integer not null,
  pool_size integer check (pool_size is null or pool_size between 2 and 100),
  podium jsonb check (podium is null or jsonb_typeof(podium) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_type, round_number),
  unique (sort_order)
);

create table public.scoring_runs (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.scoring_rounds(id) on delete cascade,
  run_order integer not null check (run_order >= 1),
  attempt_number integer not null default 1 check (attempt_number between 1 and 3),
  pool_label text check (pool_label is null or pool_label ~ '^[A-Z]{1,2}$'),
  solo_registration_id uuid references public.solo_registrations(id) on delete set null,
  team_member_id uuid references public.team_members(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  -- Stored (not generated): a generated column cannot reference a column that
  -- is later nulled by ON DELETE SET NULL without losing the grouping. Set by
  -- the builder; a trigger keeps it consistent on insert.
  entrant_key text not null check (entrant_key ~ '^(solo|team):[0-9a-f-]{36}$'),
  rider_name text not null check (char_length(btrim(rider_name)) between 1 and 200),
  horse_name text check (horse_name is null or char_length(horse_name) <= 200),
  team_name text check (team_name is null or char_length(team_name) <= 200),
  rider_location text check (rider_location is null or char_length(rider_location) <= 300),
  status text not null default 'pending' check (status in ('pending','on_course','scored','void')),
  result text check (result is null or result in ('carry','strike','miss')),
  points integer generated always as (
    case result when 'carry' then 4 when 'strike' then 2 when 'miss' then 0 else null end
  ) stored,
  scored_by uuid references public.profiles(id) on delete set null,
  scored_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, run_order),
  unique (round_id, entrant_key, team_member_id, attempt_number),
  -- A scored run has a result; an unscored one does not.
  check ((status = 'scored') = (result is not null)),
  -- Exactly one identity.
  check (num_nonnulls(solo_registration_id, team_member_id) = 1),
  check ((team_member_id is null) = (team_id is null))
);
create index on public.scoring_runs (round_id, status, run_order);
create index on public.scoring_runs (round_id, entrant_key);
create index on public.scoring_runs (scored_at desc) where scored_at is not null;

create table public.scoring_live_state (
  id boolean primary key default true check (id),
  current_round_id uuid references public.scoring_rounds(id) on delete set null,
  current_run_id uuid references public.scoring_runs(id) on delete set null,
  called_pool_label text check (called_pool_label is null or called_pool_label ~ '^[A-Z]{1,2}$'),
  display_mode text not null default 'scoreboard'
    check (display_mode in ('scoreboard','leaderboard','rider','pool_call','message','blank')),
  message text check (message is null or char_length(message) <= 200),
  updated_at timestamptz not null default now()
);
insert into public.scoring_live_state (id) values (true) on conflict do nothing;

create table public.scoring_advance_overrides (
  round_id uuid not null references public.scoring_rounds(id) on delete cascade,
  entrant_key text not null,
  advanced boolean not null,
  note text check (note is null or char_length(note) <= 300),
  set_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (round_id, entrant_key)
);
```

`updated_at` is maintained by a trigger on every table (same pattern as
`registration_drafts`). The `unique (round_id, entrant_key, team_member_id,
attempt_number)` constraint uses `nulls not distinct` (Postgres 15+) so a solo
rider cannot get two attempt-1 runs.

**Leaderboard view** `public.scoring_leaderboard` (`security_invoker = true`,
`grant select` to anon + authenticated). One row per `(round_id, entrant_key)`:

- `points`: Single → best `points` across the entrant's scored runs; Section →
  sum of the team's scored runs (one per rider).
- `best_result`: the entrant's best result (`carry` > `strike` > `miss`).
- `runs_scored` / `runs_total`: counts excluding `void` runs.
- `advanced`: if an override row exists, its value (`advanced_overridden =
  true`). Otherwise null while `runs_scored < runs_total` **and** the rule is
  not yet decided — except that a Single rider who has carried is `true`
  immediately (remaining attempts become unnecessary). Decided: Single →
  `best_result = 'carry'`; Section → `points >= target_points` (null target →
  null).
- `rank`: within round, `points desc, runs_scored asc, name asc`;
  `pool_rank`: same ordering within `pool_label`.
- `members`: Section only — jsonb array of the four riders' `team_member_id,
  rider_name, horse_name, result, points, status` in run order.
- Plus `name` (rider_name for Single, team_name for Section), `team_name`,
  `horse_name`, `location`, `pool_label`.

**Realtime**: add `scoring_runs`, `scoring_rounds`, `scoring_live_state` to the
`supabase_realtime` publication, guarded (`if exists (select 1 from
pg_publication …)` and skip when already a member). Realtime honours RLS, so the
anon SELECT policies are what make the public subscription work.

**Roles migration**: discover the existing CHECK on `profiles.role` from
`pg_constraint` (any check constraint whose definition mentions `role`), drop
it, add `check (role in ('player','judge','commentator','admin'))`. Replace
`admin_set_profile_role` so it accepts the four roles (keep its signature,
grants and audit action names; use action `set_role` with old/new in details
for the two new roles, keep `promote_admin`/`demote_admin` when admin is
involved). Add `public.has_role(variadic p_roles text[]) returns boolean`,
`security definer`, `stable`, `set search_path = ''`, same recursion-safe shape
as `is_admin()`, granted to `authenticated` only. Add a storage policy "Staff
read every headshot" on `rider-headshots` for `has_role('judge','commentator','admin')`
(read only), mirroring the admin one.

**Pre-existing drift**: the live project has two undocumented tables,
`score_attempts` and `solo_scoresheet`. Leave them untouched. They are not used
and the new tables are named `scoring_*` so nothing collides.

## 5. Database functions

All: `language plpgsql`, `security invoker`, `set search_path = ''`, `revoke
execute … from public, anon, authenticated`, `grant execute … to service_role`.
Every one takes `p_actor_id uuid, p_actor_name text, p_actor_email text` as its
last three parameters and inserts one `admin_audit_log` row in the same
transaction (`target_table` = the table touched, `details` includes
`subject_name` and the before/after that matters). Every function that touches
a run first `select … for update`s it. Errors use `raise exception … using
errcode` — `P0002` for not found, `22023` for an invalid transition — with a
message fit to show a judge on a phone.

| Function | Who calls it | Behaviour |
| --- | --- | --- |
| `scoring_record_result(p_run_id, p_result, p_override boolean, actor…)` → jsonb run | judge, admin | Lock run. Refuse if `void`. If already `scored` and not `p_override`, raise "This run already has a result. Use Change result to replace it." Set `result`, `status='scored'`, `scored_by`, `scored_at`. If `scoring_live_state.current_run_id = p_run_id`, advance: next run in the same round with `status='pending'` and the lowest `run_order` greater than this one becomes `on_course` and current; none left → `current_run_id = null`. If `display_mode = 'pool_call'`, set it back to `'scoreboard'`. Keep `called_pool_label` in step with the new current run's pool when it is behind it. Audit `record_score` or `rescore` with before/after result. |
| `scoring_call_pool(p_round_id, p_pool_label, actor…)` → jsonb live_state | judge, admin | The call-up. Validates the pool exists in the round and has at least one `pending` run. Sets `current_round_id`, `current_run_id` = that pool's first pending run (marked `on_course`, any other `on_course` run in the round reverted to `pending`), `called_pool_label`, `display_mode = 'pool_call'`. Audit `call_pool`. |
| `scoring_clear_result(p_run_id, actor…)` → jsonb run | judge, admin | Lock. Refuse unless `scored`. `result = null`, `status = 'on_course'` if it is the current run else `'pending'`. Audit `clear_score`. |
| `scoring_set_run_status(p_run_id, p_status in ('pending','void'), actor…)` → jsonb run | judge, admin | Refuse if `scored` ("Clear the result first."). Voiding the current run advances the pointer like a score does. Audit `void_run` / `restore_run`. |
| `scoring_set_live(p_payload jsonb, actor…)` → jsonb live_state | judge, admin | Partial update; keys present are applied: `current_round_id`, `current_run_id`, `called_pool_label`, `display_mode`, `message`. A run must belong to the (new) current round. Setting a run marks it `on_course` and reverts any other `on_course` run in that round to `pending` (never touches `scored`/`void`). Setting a round without a run leaves `current_run_id` null. Audit `set_live`. |
| `scoring_upsert_round(p_round_id uuid, p_payload jsonb, actor…)` → jsonb round | admin | Null id → insert; otherwise update the keys present (`name, round_number, attempts_per_rider, target_points, sort_order, pool_size, status, podium`). Refuse to change `attempts_per_rider`, `pool_size` or `event_type` once the round has any run. Validate podium entries (`place` 1–3 distinct, `entrant_key` present in the round). Audit `create_round` / `edit_round`. |
| `scoring_delete_round(p_round_id, p_force boolean, actor…)` | admin | Refuse if any `scored` run unless `p_force`. Clears the live pointer if it pointed here. Audit `delete_round` with run counts. |
| `scoring_build_start_list(p_round_id, p_mode text, actor…)` → integer runs created | admin | Refuse if the round has any `scored` run ("Clear results before redrawing."). Delete the round's existing runs. Collect entrants: `all_checked_in` → Single: `solo_registrations where checked_in_at is not null`; Section: teams whose member count is 4 and all four `checked_in_at is not null`. `advanced` → entrants with `advanced = true` in `scoring_leaderboard` for the previous round of the same `event_type` (highest `sort_order` below this one); raise if there is none. Shuffle with `random()`. Split into pools per `pool_size` using the balanced rule (null `pool_size` → one unlabelled pool). Insert runs: for each pool, for each attempt 1..`attempts_per_rider`, for each entrant (Section: four rows, leader first then `created_at`), `run_order` sequential from 1. Snapshot `rider_name = full_name`, `horse_name`, `team_name`, `rider_location = location`. Audit `build_start_list` with `{entrants, pools: {A: n, …}, runs}`. |
| `scoring_clear_start_list(p_round_id, p_force, actor…)` → integer | admin | Deletes the round's runs; refuse if any `scored` unless `p_force`. Audit `clear_start_list`. |
| `scoring_add_entrant(p_round_id, p_solo_registration_id, p_team_id, actor…)` → jsonb runs | admin | Late addition after a draw. Exactly one id. Refuse duplicates (entrant already in round). Pool = the label with the fewest entrants (ties → alphabetical first); unpooled round → null. Append `attempts_per_rider` runs (Section: ×4) at the end of that pool's block, renumbering later runs so `run_order` stays contiguous. Does not require check-in — the administrator is overriding. Audit `add_entrant`. |
| `scoring_remove_entrant(p_round_id, p_entrant_key, actor…)` → integer | admin | Deletes all the entrant's runs in the round; refuse if any `scored`. Renumber. Audit `remove_entrant`. |
| `scoring_move_run(p_run_id, p_new_order, actor…)` → jsonb round runs | admin | Reorder within the round, renumbering contiguously; refuse to move a `scored` run or to move across pool blocks. Audit `move_run`. |
| `scoring_set_entrant_pool(p_round_id, p_entrant_key, p_pool_label, actor…)` → integer | admin | Move every run of the entrant to the pool (label must already exist in the round or be the next letter), then renumber the whole round (pool, attempt, previous order). Refuse if any of the entrant's runs is `scored`. Audit `move_pool`. |
| `scoring_set_advance_override(p_round_id, p_entrant_key, p_advanced boolean, p_note, actor…)` | admin | `null` deletes the row. Audit `advance_override`. |

Renumbering helper (internal, not granted): `scoring_renumber_round(p_round_id)`
sets `run_order` by `(pool_label nulls first, attempt_number, run_order)` using
a two-phase update (negative offsets first) so the unique constraint never
trips mid-statement.

Snapshot trigger: `before insert on scoring_runs` fills `entrant_key` from the
ids if empty and validates the identity columns against the real rows
(`solo_registration_id` exists; `team_member_id` belongs to `team_id`).

## 6. API routes

All under `src/app/api/`. Every handler: `export const dynamic =
"force-dynamic"`; parse JSON with a size-safe `request.json()` in try/catch;
validate every field with explicit type guards (no `as` casts on request
bodies); return `{ error }` with 400/401/403/404/409/503; never leak Postgres
messages except the `22023`/`P0002` messages written for humans in §5. Role
checks use `verifyRoleRequest` from `src/lib/scoring/auth.ts`; service-role
client from `createServiceRoleClient` in `src/lib/admin/server.ts`.

When the scoring tables do not exist yet (Postgres `42P01` surfaces through
PostgREST as code `PGRST205` or `42P01`), `GET` routes return `configured:
false` with 200 and writes return 503 `"Live scoring is not set up yet."`.

| Route | Roles | Body → Response |
| --- | --- | --- |
| `GET /api/live/state` | public | → `PublicLiveState`. `Cache-Control: public, s-maxage=1, stale-while-revalidate=4` so Vercel's edge absorbs thousands of spectators. Selects **only** `scoring_*` tables and the view — never a registration table. |
| `GET /api/commentary/state` | judge, commentator, admin | → `CommentaryState`. Rider detail comes from `solo_registrations` / `team_members` (+ `teams`) via service role; headshot via `createSignedUrl` on `rider-headshots` using `headshot_path` from the owner's Auth metadata (solo: `profile_id`; team rider: match `auth.users` by email with `listUsers`-free lookup — skip the headshot if it would need a scan). `Cache-Control: private, no-store`. |
| `GET /api/judge/state` | judge, admin | → `JudgeState`. `no-store`. |
| `POST /api/judge/score` | judge, admin | `ScoreRequest` → `{ run: ScoringRun, state: JudgeState }` |
| `POST /api/judge/clear` | judge, admin | `ClearScoreRequest` → same |
| `POST /api/judge/status` | judge, admin | `RunStatusRequest` → same |
| `POST /api/judge/live` | judge, admin | `LiveUpdateRequest` → `{ live: LiveState, state: JudgeState }` |
| `POST /api/judge/call-pool` | judge, admin | `CallPoolRequest` → `{ live: LiveState, state: JudgeState }` |
| `GET /api/admin/scoring/rounds` | admin | → `{ rounds: ScoringRound[], runs_by_round: Record<string, ScoringRun[]>, leaderboards_by_round: Record<string, LeaderboardRow[]>, live: LiveState, candidates: { solo: {id, full_name, checked_in: boolean}[], teams: {id, team_name, checked_in_count: number}[] } }` |
| `POST /api/admin/scoring/rounds` | admin | `RoundInput` → `{ round }` |
| `PATCH /api/admin/scoring/rounds/[id]` | admin | `RoundPatch` → `{ round }` |
| `DELETE /api/admin/scoring/rounds/[id]?force=1` | admin | → `{ ok: true }` |
| `POST /api/admin/scoring/rounds/[id]/start-list` | admin | `StartListRequest` → `{ runs_created: number, runs: ScoringRun[] }` |
| `DELETE /api/admin/scoring/rounds/[id]/start-list?force=1` | admin | → `{ runs_deleted }` |
| `POST /api/admin/scoring/rounds/[id]/entrants` | admin | `{ solo_registration_id?: string; team_id?: string }` → `{ runs }` |
| `DELETE /api/admin/scoring/rounds/[id]/entrants/[entrantKey]` | admin | → `{ runs_deleted }` |
| `POST /api/admin/scoring/runs/[id]/move` | admin | `{ run_order: number }` → `{ runs }` |
| `POST /api/admin/scoring/pool` | admin | `PoolMoveRequest` → `{ runs }` |
| `POST /api/admin/scoring/advance` | admin | `AdvanceOverrideRequest` → `{ leaderboard }` |

`PublicLiveState` assembly (one place, `src/lib/scoring/server.ts`, reused by
all three GET routes): read `scoring_live_state`; all rounds ordered by
`sort_order`; the current round's runs; `scoring_leaderboard` for the current
round; `last_scored_run` = the run with the greatest `scored_at`; `up_next` =
up to 5 `pending` runs after the current run's `run_order` (or from the start
when no current run); `pools` = distinct labels in the round in order;
`pool_rosters` = one entry per entrant per pool in start order (Section
entries carry the four rider names); `next_pool_label` = the label after
`called_pool_label` in `pools`, null when it is the last or when unpooled.

**Pool call-up flow** (how riders are brought to the start): the judge or
administrator presses "Call Pool A". Every screen switches to the pool roster
with a "Pool A — get ready" banner; the commentator reads the names. The first
result recorded returns the screens to the scoreboard, which keeps showing
"Now riding: Pool A · Next: Pool B" in its header. When Pool A's last pending
run is scored, the judge panel offers "Call Pool B" prominently; pressing it
repeats the cycle. Administrators can also call a pool from `/admin/scoring`.

## 7. Realtime and resilience

One client hook, `useLiveState<T>(url)` in `src/lib/scoring/use-live-state.ts`:

- Fetches `url` immediately and whenever triggered; keeps the last good payload
  on error and exposes `{ data, error, connection: "live" | "polling" | "offline", lastUpdated }`.
- Subscribes with the browser Supabase client to `postgres_changes` on
  `scoring_runs`, `scoring_live_state` and `scoring_rounds` (one channel);
  every event schedules a refetch, debounced 150 ms.
- Polls every 4 s while the channel is not `SUBSCRIBED`, every 20 s while it is
  (belt and braces), and refetches on `visibilitychange` → visible and on
  `online`.
- Never throws into the render; the panels show a small connection badge.

The judge panel additionally reconciles after every write with the `state`
returned by the write, so it never waits on realtime to show its own action.

## 8. UI surfaces

Brand: the parchment/bronze/Oswald language of the site for `/live`; the staff
panels and overlays use the `ink` dark ground with `cream` text and `bronze`
accents (tokens in `globals.css`) for legibility outdoors and on video. All
panels mobile-first; the judge panel is designed for a phone in bright sun
(huge targets, high contrast, no hover-only affordances). Honour
`prefers-reduced-motion` for every animation. Every page that is not public
sets `robots: { index: false, follow: false }` in its metadata and is omitted
from `sitemap.ts`; `/live` is added to the sitemap.

**Chrome**: `src/components/SiteChrome.tsx` (client) wraps Navbar and Footer in
`layout.tsx` and renders neither when `usePathname()` starts with `/overlay`,
`/judge` or `/commentary`. The root layout markup otherwise stays as it is.
Overlay pages make the page transparent with an inline `<style>` setting
`html, body { background: transparent !important }` scoped by a class on
`<html>` toggled in an effect, so nothing else on the site changes.

**`/judge`** (server component gates `judge | admin`; otherwise a Login /
Access-denied page in the style of `/admin/page.tsx`, with
`/login?redirect=/judge`). Client `JudgePanel`:

- Header: round name, pool, "Run 12 of 48", connection badge.
- Current rider card: name very large, team/horse, attempt N of M.
- Three buttons filling the width: **CARRIED 4**, **STRUCK 2**, **MISS 0**.
  Tapping arms the choice; a confirm bar appears ("Record Carried for Harpreet
  Singh?" → Confirm / Cancel); confirm sends `POST /api/judge/score`. Buttons
  disable while a request is in flight. Errors show in a toast with the server
  message.
- "Undo last result" (clear) for the most recently scored run, with confirm.
- "Skip run" (void) with confirm; "Restore" on a voided run.
- **Call Pool** control: shows the called pool and the next pool; when the
  called pool has no pending runs left, a full-width "Call Pool B" button
  appears (confirm, then `POST /api/judge/call-pool`). Any pool can be called
  from the start list drawer's pool headers.
- Start list drawer: every run in the round grouped by pool, status chips,
  tap to make it the current run (`POST /api/judge/live`).
- Round picker: switch the live round (judge may set `current_round_id`).
- "Change result" on an already-scored run requires the override path, with
  the old result shown.

**`/commentary`** (gates `judge | commentator | admin`). Landscape laptop /
tablet layout, dark:

- Left two-thirds: **On course now** — rider name (largest type on the page),
  "son/daughter of {father}" and "{mother}" lines (hide whichever is null, label
  them Father / Mother so the announcer doesn't guess), home location (full
  string), horse name · breed · age, years of experience, team name and leader
  flag, headshot if present, today's runs as chips with results, running total
  and current rank / pool rank. Result flash when the current run is scored.
- Right third: **Up next** (3 riders, same detail compressed), **Pool
  standings** (current pool), **Round standings** toggle, round progress bar.
- Footer strip: message from `live_state.message` when set.
- In `pool_call` mode the left panel becomes the called pool's roster in
  announcement order (large type, one name per line, team rider names under
  the team), headed "Pool B — get ready", with "Next: Pool C" beneath.
- Reads `GET /api/commentary/state` through `useLiveState`.

**`/live`** (public, site chrome on). Mobile-first: a sticky header line
"Now riding: Pool A · Next: Pool B"; in `pool_call` mode a prominent "Pool B —
get ready" card listing that pool's riders replaces the on-course card; then
"On course now" card, last result flash, up-next list, a **Pools** tab listing
every pool's riders (so a rider can find their own pool on their phone), then
standings with pool tabs (A, B, …, All) and a rounds selector for completed
rounds. Section rows expand to show the four
riders. Shows `configured: false` as "Live scoring begins on {site.eventDate}".
Add `{ href: "/live", label: "Live Scores" }` to `footerQuickLinks` in
`site.ts`. Do not add a navbar tab (stakeholder rule: three tabs).

**`/overlay`** index page (public, dark, not transparent) that explains setup:
add a Browser Source in OBS (URL, width 1920, height 1080, "Shutdown source
when not visible" off, custom CSS blank), vMix → Add Input → Web Browser with
the same URL, and the JSON endpoint for data-source tools. Lists each overlay
URL with a thumbnail description. Overlays (all transparent, 1920×1080 safe,
also legible at 1280×720, `display_mode` aware — `blank` renders nothing,
`message` shows only the message bar):

- `/overlay/scorebug` — compact top-left bug: round · pool, rider name, team or
  horse, and a 4-second result flash with points when `last_scored_run` changes.
- `/overlay/lower-third` — bottom-left lower third for the current rider: name,
  team/horse, short location (`shortLocation`), attempt N of M. Slides in on
  rider change.
- `/overlay/leaderboard` — centred standings table for the current pool
  (`?pool=A` to pin a pool; default follows the current rider's pool; `?all=1`
  for the whole round), paginated 10 rows per page, auto-cycling pages every 8 s.
- `/overlay/ticker` — bottom ticker cycling the latest results ("Harpreet Singh
  — Carried 4 · Pool B") and the message.
- `/overlay/pool-call` — full-frame "Pool B — get ready" roster card shown
  only in `pool_call` mode (transparent otherwise), two columns for up to 12
  names, "Next: Pool C" footer. The scorebug and lower-third also show a
  compact "Now: Pool B · Next: Pool C" line at all times.

No parents' names, ages or any registration field beyond the run snapshot
appear on `/live` or `/overlay/*`.

**`/admin/scoring`** (admin only; link it from the admin dashboard tab bar as a
plain link labelled "Scoring"). Rounds list with create/edit (name, event type,
round number, attempts, target, pool size, sort order, status); per round:
"Draw start list" (mode picker, shows how many entrants qualify and the pool
sizes that will result before confirming), start list table grouped by pool
with move / remove / change pool, "Add late entrant" search over checked-in
candidates (and a checkbox to include not-yet-checked-in ones, clearly
labelled), advance overrides, podium entry for the final, "Set live", "Call
Pool …" buttons on each pool header, a printable pool sheet view (plain
black-on-white list of every pool's riders, `@media print` friendly, for the
notice board at the venue) and "Mark complete". Destructive actions confirm
and name what will happen.

## 9. Parents' names

Add `father_name text` and `mother_name text` to `solo_registrations` and
`team_members`: nullable, `check (x is null or char_length(btrim(x)) between 1 and 200)`.
Grant `select, insert, update` on the two columns to `authenticated` on both
tables (harmless where the table-wide grant exists; required where grants are
column lists). Patch `admin_mutate_registration` in place with the
`pg_get_functiondef` + asserted `replace` pattern used by
`20260731210000_team_emergency_contact.sql`: add both columns to **both**
editable field arrays and both UPDATE statements. Recreate
`admin_find_rider_by_code` (drop first — the return type changes) to return
both columns from both tables.

Forms: solo `RegisterForm` and each rider step of `TeamRegisterForm` get
"Father's name" and "Mother's name" fields directly after the rider's name,
**optional**, trimmed, max 200, saved in drafts (`SoloDraftData`,
`TeamRiderDraft`), shown on the team Review step, validated in
`register-team/submit/route.ts`, and included in the inserts. Admin dashboard:
both fields editable for solo and team riders (optional — the admin route's
"all required" validation must treat these two as optional strings), searchable,
shown on the check-in panel record and on the `/account` registration cards.
Existing rows stay null and remain editable.

Rationale for optional: registrations are open and many riders will register
in the coming weeks; a required field would block an entry, and the names
exist to help the announcer, not to gate participation. Flip to required in
the submit route if the organisers decide otherwise.

## 10. Security checklist (every task self-reviews against this)

- No route returns registration columns to anonymous callers. `GET
  /api/live/state` and the overlays touch only `scoring_*`.
- No client role can INSERT/UPDATE/DELETE any `scoring_*` table or call any
  `scoring_*` function; `revoke execute … from public, anon, authenticated`
  on every function, including trigger functions.
- `profiles.role` cannot be self-escalated (existing lock stays); the only role
  write path is `admin_set_profile_role` via `/api/admin/users`.
- Every mutating route verifies the role server-side and derives the audit
  actor from the session, ignoring any actor fields in the body.
- Every state transition is validated inside the function under `for update`.
- Request bodies are validated with type guards; unknown keys ignored; strings
  trimmed and length-capped; UUIDs checked against
  `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`.
- `X-Frame-Options: DENY` stays: OBS/vMix browser sources are not iframes, so
  overlays still work; document that embedding in an iframe is deliberately
  blocked.
- Panels degrade: tables missing → calm empty state; realtime down → polling;
  request failed → toast, state unchanged, buttons re-enabled.

## 11. Task split and file ownership

Three build tasks run in parallel. **Touch only your files.** `docs/*.md` and
`README.md` belong to the QA task at the end. Add or update `.test.mts`
source-text tests for your own files and register them in `package.json`'s
`test` script **only via the QA task** (to avoid three edits to one line, list
the test files you added in your final report instead).

**Task A — Registration & admin UI.** Owns:
`supabase/migrations/20261025100000_rider_parent_names.sql`,
`src/app/register/solo/**`, `src/app/register-team/**`,
`src/lib/registration-drafts.ts`, `src/app/account/**`, `src/app/admin/AdminDashboard.tsx`,
`src/app/admin/page.tsx`, `src/app/admin/CheckInPanel.tsx`, `src/app/admin/*.test.mts`,
`src/app/api/admin/registrations/**`, `src/app/api/admin/check-in/**`,
`src/app/api/admin/users/**`. Also: role dropdown with the four roles
(`PROFILE_ROLES` from types.ts) in the Profiles tab and in
`/api/admin/users` (the DB function will accept all four — Task B ships it);
audit-log labels for `scoring_rounds`, `scoring_runs`, `scoring_live_state`,
`scoring_advance_overrides`; two plain links in the admin tab bar: "Scoring" →
`/admin/scoring` and "Paper entry" → `/admin/paper`; and wherever a
registration's email is displayed, render an address on the
`@paper.nezabazipunjab.com` domain as "No email (paper entry)" (see §13).

**Task B — Scoring backend + admin scoring UI.** Owns:
`supabase/migrations/20261025110000_staff_roles.sql`,
`supabase/migrations/20261025120000_live_scoring.sql`,
`src/lib/scoring/server.ts` (and any other new file under `src/lib/scoring/`
except `types.ts`, `auth.ts`, `use-live-state.ts`), `src/app/api/live/**`,
`src/app/api/commentary/**`, `src/app/api/judge/**`, `src/app/api/admin/scoring/**`,
`src/app/admin/scoring/**`, tests beside those files.

**Task C — Live UIs.** Owns: `src/components/SiteChrome.tsx`,
`src/app/layout.tsx`, `src/app/layout.test.mts`, `src/lib/site.ts`,
`src/app/sitemap.ts`, `src/lib/scoring/use-live-state.ts`, `src/app/live/**`,
`src/app/judge/**`, `src/app/commentary/**`, `src/app/overlay/**`,
`src/components/scoring/**`, tests beside those files.

**Task E — Paper registration.** Owns:
`supabase/migrations/20261025130000_paper_registrations.sql`,
`scripts/build-paper-forms.mts` (+ `scripts/fonts/`),
`public/documents/registration-form-solo.pdf`,
`public/documents/registration-form-team.pdf`, `src/app/register/paper/**`,
`src/app/register/page.tsx` (add the paper-form link only),
`src/app/admin/paper/**`, `src/app/api/admin/paper-registration/**`,
`src/lib/paper-registration.ts`, `src/lib/email/resend.ts` (refuse the
placeholder domain only), `package.json` `build:forms` script and the
`pdf-lib` devDependency (the only package.json edit outside Task D).

**Task D — QA & hardening** (after A–C and E): `npx tsc --noEmit`, `npm run lint`,
`npm test`, `npm run build`; wire new tests into `package.json`; validate the
three migrations against a disposable Postgres 17 (Docker) with a stand-in of
the pre-existing tables if Docker is running; review every route against §10;
update `README.md`, `docs/supabase-changes.md` (migrations 17–19), and write
`docs/live-stream.md` (OBS/vMix setup, JSON endpoint, how to apply the
migrations in the Supabase SQL editor in order, and verification queries);
verify the pages in the browser against the dev server.

## 13. Paper registration

Many riders will not register online; organisers collect a paper form and key
it in. Two pieces:

**Printable forms.** `scripts/build-paper-forms.mts` (run with
`npm run build:forms`, `pdf-lib` as a devDependency, Node ≥ 24) generates two
A4 PDFs into `public/documents/` and they are committed:

- `registration-form-solo.pdf` — one rider: full name, father's name, mother's
  name, age, phone, email (marked "if you have one"), village / city, district,
  state, country, years of tent-pegging experience, horse name, horse age,
  horse breed, emergency contact name and phone; rider declaration and
  signature line with date ("I accept the rules of the {site.title} and
  confirm these details are correct"); an "Office use only" box: confirmation
  code, entered by, date entered, checked.
- `registration-form-team.pdf` — team name, team emergency contact name and
  phone, then four rider blocks (rider 1 marked "Team leader") with the same
  rider fields minus emergency contact, declaration with four signature lines,
  office box with four code lines.

Both: event title, date and venue from `src/lib/site.ts` in the header (no
organisation names anywhere — stakeholder rule), the logo mark from
`public/brand/logo-mark.svg` rasterised or redrawn as vector paths if pdf-lib
cannot embed SVG, boxed fields with ruled lines tall enough for handwriting
(≥ 9 mm), **fillable AcroForm text fields** over the same boxes so the PDF can
also be typed into, labels in English with Punjabi (Gurmukhi) beneath using
Noto Sans Gurmukhi (OFL, download into `scripts/fonts/` at build time; if the
download fails the build still succeeds English-only and says so), and a
footer with `site.url` and `site.email`. Print-safe: black on white, no
background fills darker than 10 %.

`/register/paper` (public, site chrome) explains when to use the paper form,
links both PDFs, and says where to hand them in (`site.email`). `/register`
gains a small "Prefer paper? Download the form" link under the two choices.

**Admin paper entry.** `/admin/paper` (admin only) is a form mirroring the
paper sheet, solo or team, that creates the registration on the rider's behalf:

- `POST /api/admin/paper-registration` → service-role function
  `admin_create_paper_registration(p_type text, p_payload jsonb, actor…)` →
  returns the created row(s) with confirmation codes. One transaction, one
  audit row per registration (`action = 'paper_registration'`, details
  include the payload minus nothing — it is all the admin typed).
- Validation mirrors the online submit routes (same bounds, phone and email
  uniqueness across both tables, team of exactly four, leader first).
- **Email is optional on paper.** When blank, the function stores a generated
  placeholder `no-email-<12 random lowercase alphanumerics>@paper.nezabazipunjab.com`
  so the existing NOT NULL / UNIQUE / format constraints and the
  one-code-per-rider trigger keep working unchanged. `src/lib/email/resend.ts`
  refuses to send to that domain (returns `skipped`), and every place that
  shows an email renders it as "No email (paper entry)". An administrator can
  later replace it with the rider's real address through the normal edit path,
  which links the rider to an account by the usual email-identity rule.
- `profile_id` (solo) and `leader_profile_id` (teams) are made nullable if they
  are not already (guarded by `pg_attribute.attnotnull`), since a paper rider
  has no account; owner-scoped RLS compares against `auth.uid()` and simply
  never matches a null, so these rows are visible to administrators only.
- New columns on `solo_registrations` and `teams`: `registration_source text
  not null default 'online' check (registration_source in ('online','paper'))`,
  `entered_by uuid references profiles(id) on delete set null`. Granted for
  select to `authenticated`; not insertable or updatable by clients (the
  default applies to online rows).
- Before creating, the panel searches existing registrations by phone and by
  name and shows matches, so a rider who also registered online is not entered
  twice; the server enforces the same uniqueness anyway.
- The success screen shows the confirmation code(s) large for writing onto the
  paper form's office box.

## 12. Applying the migrations

The live project is not connected to this development session, so the three
files are applied by hand in the Supabase SQL editor, in filename order, and
then the verification block at the end of `docs/live-stream.md` is run. Each
migration is idempotent (`if not exists` / `drop … if exists`) and asserts its
own preconditions loudly, in the style of the existing files.
