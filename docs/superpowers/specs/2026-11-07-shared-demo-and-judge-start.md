# One shared demo on every device, a demo feed for the graphics team, and judges starting each rider — design (7 November 2026)

Three asks from the organisers after the phone-fit panels landed:

1. **The demo must be one session on every device.** Today `/judge/demo` and
   `/commentary/demo` on the live site give each signed-in person their own
   practice session in the server's memory (`sample-session.ts`,
   `personalTrainingSession`), so a judge on a phone and a commentator on a
   laptop never see the same thing, and a Vercel instance change can reset it.
   The organisers want to rehearse the whole day together: judges, commentary
   and the stream, each on their own device, all on the same demo.
2. **Judges start each rider.** Today a result moves the live pointer straight
   to the next rider (`scoring_advance_live_pointer`), so the next rider is
   "on course" the instant the previous one is scored. The organisers want:
   score → nobody on course (the rider leaves) → the judge starts the next
   rider → score. *Pending the organisers' confirmation; see Part 2.*
3. **Two rehearsal feeds for the graphics team.** `?sample=solo` is the
   scripted loop. A second address, `?sample=demo`, must follow the shared
   demo in real time, so titles and overlays can be tested against what the
   judges are actually doing in the rehearsal.

Parts 1 and 3 are built together (3 depends on 1). Part 2 is a separate
migration and worker, started once confirmed.

## Part 1 — The shared demo session (persisted)

### Decisions

- **The practice session's state becomes a row.** The engine's state is
  plain data (`SampleSeed`: rounds, runs, live, overrides, progression) and
  `createSampleEngine(seed)` rebuilds the engine from it, so the whole
  session can live in one jsonb row and be rebuilt per request. No Vercel
  instance can lose it, and every device reads the same row.
- **One session on the live site: `shared`.** `resolveSampleAccess` returns
  `{ kind: "training", session: SHARED_TRAINING_SESSION }` for every signed-in
  judge, commentator or administrator. Personal sessions go away: the demo is
  the organisers' rehearsal, not private practice. "Reset training data"
  restarts it for everyone, and the confirmation says so.
- **A laptop with `SCORING_SAMPLE_MODE=1` keeps the in-memory shared session**
  (`LOCAL_TRAINING_SESSION`, no login), exactly as today. The in-memory store
  stays for that path only.
- **Polling, not Realtime.** The panels already poll every 2 s in training
  (`POLL_IN_TRAINING_MS`); that is fine for a rehearsal and keeps the table
  out of the realtime publication.
- **Writes are a single versioned update.** Each judge write loads the row,
  rebuilds the engine, applies the action, and saves the new state with
  `where version = <loaded>`; a lost race reloads and re-applies once, then
  refuses with 409 "Someone else just changed the practice. It has refreshed;
  try again." (a `SampleRefusal`). Two judges tapping the same run still get
  the engine's own "already scored" refusal.
- **Service role only.** The table has RLS on and no policies; browser roles
  are revoked. It holds invented riders only, so reading it from a public
  route (Part 3) leaks nothing.
- **Before the migration is applied**, the live site falls back to the
  in-memory shared store (one session per instance) and the banner adds
  "(not yet shared between devices)". Nothing breaks.

### Database contract — `supabase/migrations/20261107120000_scoring_training_sessions.sql`

Idempotent, preconditions, verify block, `notify pgrst, 'reload schema'`,
house style of `20261028120000_scoring_rehearsal_feed.sql`.

```sql
create table if not exists public.scoring_training_sessions (
  id text primary key,                 -- 'shared'
  state jsonb not null,                -- SampleSeed, as sample-session.ts stores it
  version bigint not null default 1,   -- bumped on every save; the save checks it
  updated_at timestamptz not null default now(),
  updated_by uuid                      -- the staff member who last wrote, for diagnostics only
);
alter table public.scoring_training_sessions enable row level security;
revoke all on public.scoring_training_sessions from public, anon, authenticated;
-- no policies on purpose: service_role only
comment on table ... is 'The organisers'' shared practice session (invented riders only). Written by the server through the service role; never real results.';
```

Verify: table exists, RLS on, `has_table_privilege('anon' | 'authenticated', ..., 'select')` false.

### Server contract — `src/lib/scoring/training-db.ts` (new, `server-only`)

```ts
export const SHARED_TRAINING_SESSION = "shared";
export type StoredTraining = { state: SampleSeed; version: number };
/* null = no row yet (start from buildSeed()). Throws TrainingNotConfigured when the table is missing. */
export const loadTrainingState: (client: ServiceRoleClient, key: string) => Promise<StoredTraining | null>;
/* Insert when expectedVersion is null, else update where version = expectedVersion. Returns false on a lost race. */
export const saveTrainingState: (client, key, state: SampleSeed, expectedVersion: number | null, updatedBy: string | null) => Promise<boolean>;
export const deleteTrainingState: (client, key) => Promise<void>;   // reset = delete; next load seeds afresh
export class TrainingNotConfigured extends Error {}                  // codes PGRST205 / 42P01
```

`sample-session.ts`: every exported read/write (`recordResult`, `clearResult`,
`setRunStatus`, `setLive`, `callPool`, `takeOut`, `reset`,
`sampleJudgeState`, `sampleCommentaryState`, `samplePublicLiveState`) becomes
`async` and goes through one `withSession(key, use)` helper: for
`LOCAL_TRAINING_SESSION` the in-memory engine as today; for any other key the
database row (seed → `createSampleEngine` → `use(engine)` → save with the
version check, retry once; reads never save). The seed stored is
`{ ...engine.snapshot(), progression }`. `assembleSnapshot` stays pure and
synchronous (the moving vMix loop uses it).

`sample-mode.ts`: `sampleResponse` / `sampleWriteResponse` accept an async
`produce` / `apply`. Every route that calls them (`api/judge/state`, `score`,
`clear`, `live`, `status`, `call-pool`, `take-out`, `reset-sample`,
`api/commentary/state`) awaits. `resolveSampleAccess` returns the shared key
for staff. `training.ts` banner and reset texts: "shared" → "Practice data —
one demo shared by everyone, on every device; nothing is recorded." and
"This restarts the demo for everyone, on every device." The judge and
commentary demo pages pass `sample="shared"` on the live site.

## Part 3 — `?sample=demo`: the feeds, `/live` and the overlays follow the demo

- `wantsSample(url)` in `vmix.ts` also accepts `demo`. `vmixSampleSource(url)`
  gains a `demoSample()` branch: load the shared row through the service
  role (seed when none), `assembleSnapshot`, and expose the same
  `VmixSampleSource` shape as the moving loop. Every row `sample = "Yes"`.
  No switch: the demo feed is always available (it is never real data).
- `GET /api/live/state?sample=demo` answers `samplePublicLiveState(SHARED)`
  with `Cache-Control: public, s-maxage=1, stale-while-revalidate=4`. The
  existing `?sample=1` behaviour (local laptop only) is unchanged.
- `use-live-state.ts` forwards `?sample=demo` as it forwards `?sample=1`
  (`SAMPLE_FLAG` and `withSample` generalised to `1 | demo`), so
  `/live?sample=demo` and every `/overlay/*?sample=demo` follow the demo on
  the live site with no login. `live-pages.test.mts` must keep passing.
- **The Graphics Rehearsal Feed card** on `/admin/scoring` becomes two
  blocks: "Scripted loop (`?sample=solo`)" with the Start/Stop switch as
  today, and "Follows the demo (`?sample=demo`)", always on, listing the four
  feed addresses plus `/live?sample=demo` and the overlay addresses, with one
  line: "Everything the judges do on `/judge/demo` shows here within two
  seconds."
- Docs: `docs/vmix-data-feed.md` new section "Rehearsing with the judges:
  `?sample=demo`" after the `?sample=solo` one, and the options row;
  `docs/live-stream.md` quick reference; `docs/event-day-runbook.md`
  section 9 rewritten for the shared demo (the vMix feeds *do* follow it
  now); `docs/supabase-changes.md` entry 24; README feed table row. Rebuild
  `public/documents/vmix-guide.pdf` with `npm run build:guide` if the fonts
  are present; otherwise say so.

### Tests (house style)

`src/lib/scoring/training-db.test.mts` (new): the migration enables RLS,
has no policies and revokes browser roles; `saveTrainingState` checks the
version; `resolveSampleAccess` returns the shared key for staff and the local
key only under `SCORING_SAMPLE_MODE=1`; every training route awaits;
`wantsSample` accepts `demo`; `/api/live/state` serves `?sample=demo` from the
shared session and never with `private` caching; `use-live-state` forwards
`demo`. `live-scoring.test.mts`, `sample-engine.test.mts`,
`scoring-routes.test.mts`, `public-state.test.mts` and `live-pages.test.mts`
keep passing (adjust an assertion only where a route became async, and say so).

### File ownership — Worker A (Parts 1 and 3)

`supabase/migrations/20261107120000_scoring_training_sessions.sql` (new),
`src/lib/scoring/training-db.ts` (new), `src/lib/scoring/sample-session.ts`,
`src/lib/scoring/sample-mode.ts`, `src/lib/scoring/training.ts`,
`src/app/api/judge/{state,score,clear,live,status,call-pool,take-out,reset-sample}/route.ts`,
`src/app/api/commentary/state/route.ts`, `src/app/judge/demo/page.tsx`,
`src/app/commentary/demo/page.tsx`, `src/lib/scoring/vmix.ts`,
`src/lib/scoring/vmix-sample-live.ts`, `src/app/api/live/state/route.ts`,
`src/lib/scoring/use-live-state.ts`, `src/app/admin/scoring/ScoringAdmin.tsx`,
`src/lib/scoring/training-db.test.mts` (new), the four docs above,
`README.md` feed table row, `public/documents/vmix-guide.pdf`. Not
`sample-engine.ts` (Part 2 owns it) and not `JudgePanel.tsx`.

## Part 2 — Judges start each rider (awaiting confirmation)

What changes if confirmed, in `supabase/migrations/20261107130000_scoring_judge_starts_each_rider.sql`
(patching with the `scoring_patch_body` technique of the round-first
migration, asserted substitutions):

- `scoring_record_result`: where it calls `scoring_advance_live_pointer`
  (the scored run was on course, or the on-course run was auto-voided by a
  carry), set `current_run_id = null` instead and leave the next rider
  `pending`; `v_next_run_id` (kept in the audit details) becomes the id of
  the next pending run, found without changing its status. The called pool
  is untouched by a result.
- `scoring_set_run_status` (Skip of the rider on course) and
  `scoring_take_out` (Take out of the rider on course): the same.
- `scoring_set_live` with `current_run_id` (the judge's "Start") is already
  the way a rider comes on course and already moves the called pool
  (`scoring_called_pool_after`); unchanged. `scoring_call_pool` still puts the
  pool's first rider on course when a pool is called — *to confirm:* keep
  that, or should a call-up also wait for the judge's Start?
- `sample-engine.ts` mirrors every change (`recordResult`, `setRunStatus`,
  `takeOut`), so the demo behaves exactly like the day.
- Judge panel: when nobody is on course and a next rider is waiting, one
  large button **Start <name>** (no confirmation dialog for the natural next
  rider; the Skipped / Out boxes keep theirs), and the last result stays
  visible above it. Status bar and commentary show "Up next · <name>" between
  riders; the scorebug shows the last result and the next rider. Runbook
  sections 5 and 6 and the staff guide outline say so; rebuild
  `staff-guide.pdf` if the fonts are present.
- Tests: the migration patches exactly the three functions and asserts each
  substitution; the engine's result leaves `current_run_id` null;
  `JudgePanel` has the Start button.

Owner: Worker B — `sample-engine.ts`, the new migration, `JudgePanel.tsx`,
`judge-actions.ts`, `sample-engine.test.mts` additions, runbook sections 5–6,
staff-guide outline, `staff-guide.pdf`.

## Part 4 — Demo on the real riders (awaiting the organisers' choice)

Asked on 7 Nov: can the demo use the real registered riders, kept in step
with the registrations as they come in?

What exists: the demo's riders are 30 invented ones (`TRAINING_RIDERS`); the
real pools are drawn on `/admin/scoring` with **Draw the start list** after
check-in, randomised and balanced by `balancedPoolSizes` from the riders who
checked in. Judging never draws by itself, because the draw must wait for
check-in to close; the button is the one deliberate step.

Proposed: **Reset training data rebuilds the demo from the registrations**
(every registered rider, or only checked-in ones — to decide), drawn with the
real draw rules and pool size, so a reset is a fresh copy and a running demo
keeps its riders and results until the next reset. "Constantly updated"
would otherwise wipe results mid-rehearsal.

The one thing to decide first: `?sample=demo`, `/live?sample=demo` and the
overlays are public addresses with no login. With real riders the demo would
show their names, horses and district on those addresses before the event —
the same fields the real scoreboard shows on the day, nothing more (no
contact details, ages or parents' names, which stay on the staff-only
commentary panel). If that is acceptable to the organisers, build it; if not,
keep the invented riders on the public demo addresses and use real riders on
the staff panels only.
