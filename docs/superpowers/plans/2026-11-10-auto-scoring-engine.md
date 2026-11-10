# Auto scoring engine — Single tent pegging

Status: plan, for review. Written 10 Nov 2026 with Mani; rules confirmed with
the organisers the same day. Teams (Section) keep the manual Scoring page for
now.

## 1. The rules the engine follows

### Start order

- When check-in closes, one button puts every checked-in solo rider into
  **pools of about 12**, evenly sized (150 riders → 13 pools of 11–12),
  shuffled once.
- That order is **the queue for the whole event**. It is never shuffled again.
  Riders drop out of it (knocked out, disqualified) and everyone else keeps
  their place. Only a skip (below) can move someone, and only slightly.

### Qualifiers — Rounds 1, 2, 3 (the only rounds with pools)

| Round | Who rides | Order |
|---|---|---|
| 1 | every rider | Pool A, Pool B, Pool C, … |
| 2 | riders without a 4 yet | same pools, same order |
| 3 | riders still without a 4 | same pools, same order |

- **Only a 4 (carry) qualifies.** A 2 counts as a miss here.
- A rider with a 4 is through at once and sits out the remaining qualifier
  rounds.
- No 4 after all three = out.
- **Late arrival** (checks in after Round 1 has passed their pool): joins the
  end of the smallest pool and rides from Round 2, so two tries.

### Aarhi rounds — no pools, one queue

- Everyone through rides **once, in the original start order**, as one
  queue: no pool letters, no shuffle.
- Who goes through:
  1. if anyone gets a **4** → everyone with a 4 goes through;
  2. if nobody gets a 4 but someone gets a **2** → everyone with a 2 goes
     through;
  3. if **everyone gets 0** → nobody is out; the same riders ride the next
     numbered Aarhi round (Round 4 all 0 → the same riders ride Round 5).
- After each round:
  - **more than 4 through** → another Aarhi round;
  - **exactly 4 through** → the next round is the **Final**;
  - **fewer than 4 through** → the places are decided from this round
    (see Placings).

### Placings (Final, or a round that leaves fewer than 4)

Only 1st, 2nd and 3rd are placed. Riders are grouped by score in the deciding
round, highest first (4 → 2 → 0), and places are filled from 1st down:

- A group of **one** takes the next place outright.
- A group of **several** rides a **ride-off** for the places it covers. Each
  rider rides once; the ride-off's own scores are grouped the same way. Still
  tied → they ride again, as often as needed.
- A group that is larger than the places left rides off for those places; the
  rest are out.
- A group of 0s that is still needed for a place is a ride-off like any
  other ("they go again").
- Once 1st–3rd are filled, everyone else is out.

Examples (scores in the deciding round):

| Scores | Result |
|---|---|
| 4, 4, 2, 2 | the 4s ride off for 1st/2nd; the 2s ride off for 3rd |
| 4, 4, 2, 0 | the 4s ride off for 1st/2nd; the 2 is 3rd; the 0 is out |
| 4, 2, 2, 0 | the 4 is 1st; the 2s ride off for 2nd/3rd |
| 4, 4, 4, 0 | the three 4s ride off for 1st–3rd |
| 0, 0, 0, 0 | all four ride again for 1st–3rd |
| 7 riders: 4, 4, then five 0s | the 4s ride off for 1st/2nd; the five 0s ride again for 3rd |
| 7 riders: 4, 4, 2, 0, 0, 0, 0 | the 4s ride off for 1st/2nd; the 2 is 3rd |
| 7 riders: 4, 4, 2, 2, 0, 0, 0 | the 4s ride off for 1st/2nd; the 2s ride off for 3rd; the 0s are out |

The same logic covers the (unlikely) case of only 1–3 riders qualifying.

### Skips, no-shows, disqualifications

- **Skip** (not ready when called): the rider moves to **the end of their
  pool** in that round (in an Aarhi round, which has no pools: the end of the
  round). Everyone behind them moves up one.
- **No-show** (skipped and not back when their pool / round ends): the round
  **cannot be closed** until an admin marks them 0, disqualifies them, or
  lets them ride.
- **Disqualified**: removed from the event (Take out); nobody else moves.

### Corrections

- After **Start next round**, while nobody in the new round has ridden, an
  admin can **Undo next round**, fix the score, and start it again.
- Once riding has begun, fixes go through the existing **override** (go
  through / out) on the Scoring page.

### Manual fallback (always available)

- Everything the engine does is an ordinary round on the Scoring page, so an
  admin can still create rounds, draw, move riders, override who goes
  through and set the podium by hand.
- An **Auto engine on/off** switch on the Scoring page. Off = the page
  behaves exactly as it does today.
- A podium set by hand is never overwritten by the engine.

## 2. What already exists (keep)

- `scoring_rounds` / `scoring_runs`, `scoring_leaderboard`, overrides,
  podium (`supabase/migrations/20261025120000_live_scoring.sql`).
- Qualification as **one round with 3 attempts**, ridden attempt by attempt
  across all pools, a carry auto-skipping the rider's remaining attempts
  (`20261107100000_scoring_round_first_order.sql`). Judges and commentary
  already call the attempts Round 1/2/3. **This already matches the
  qualifier rules.**
- Drawing `all_checked_in` into balanced pools (`balancedPoolSizes`).
- Take out / Bring back, Skip / Restore, late entrant (joins the smallest
  pool), clear start list.
- Judges' panel, commentary, `/live`, overlays and vMix read rounds and runs
  generically, so new rounds show up on every screen without changes there.

## 3. What changes

### A. Next round keeps the start order, no pools — DB

`scoring_build_start_list(…, 'advanced')` today **shuffles** the riders and
re-pools them. New behaviour for Single rounds after the qualifiers:

- order = the riders' order in the previous round (`run_order` of their first
  run), which is the original start order;
- one unlabelled pool (`pool_size` null);
- Section rounds unchanged (still shuffled), since teams stay manual.

### B. Who goes through in Aarhi rounds — DB

Today `advanced` for Single = "has a carry". Add the 2-tier rule: if a
round finished with no carry, the riders with a strike go through. Done by the
engine writing **override rows** ("No 4s this round — highest points go
through") when it starts the next round, so the leaderboard, `/live` and vMix
show the right ✓/✗ with no change to the view. All 0s → the next Aarhi
round has the same riders, in the same order.

### C. Start next round / Undo next round — DB + API + Scoring page

New function `scoring_start_next_round(previous_round_id, actor…)`, one
transaction with its audit row:

1. refuses while any run in the previous round is still to ride, or a skipped
   rider has no decision (no-show rule);
2. works out who is through (A + B);
3. decides what comes next: Aarhi round N+1 (with the same riders if all got
   0), the Final, or ride-offs (§1 Placings; the 3rd-place ride-off first);
4. creates the round(s) and draws them in order;
5. returns a summary the page shows **before** confirming ("12 through ·
   Aarhi Round 3 · first up: …").

`scoring_undo_next_round(round_id)` deletes that round only while none of its
runs has a result.

On the Scoring page: a **Next step** card at the top showing the current
stage, who is through, and one button (Start Aarhi Round N / Start the
Final / Start ride-off), with a preview and a confirm. After qualifier Round
3 it prepares Aarhi Round 1 the same way and waits for the confirm.

### D. Final and ride-offs, automatic podium — DB + pure TS

- New columns on `scoring_rounds`: `stage` (`qualifier` | `aarhi` | `final` |
  `rideoff`), `places_from`, `places_to` (the places a ride-off decides),
  `parent_round_id`.
- A pure function `decidePlacings(scores, placesFrom, placesTo)` in
  `src/lib/scoring/placings.ts` returning `{ placed: [...], rideOffs: [...],
  out: [...] }` — the §1 table is its unit tests. The SQL function mirrors it
  (tested against the same cases).
- Ride-off rounds are named for the screens: "Ride-off · 1st & 2nd",
  "Ride-off · 3rd".
- When every place is settled, the engine writes the Final's `podium`
  (unless an admin already set one by hand).

### E. Skip to the end of the pool, no-show block, late arrival — DB

- Skip (`scoring_set_run_status` → void) also moves the run to the end of
  its pool for that attempt; Restore makes it pending there.
- A round with a skipped run and no decision cannot be closed or followed by
  Start next round.
- Late entrant into the qualifier after their pool's Round 1 has passed:
  created with attempts 2 and 3 only.

### F. Practice mode

The training session (`sample-engine.ts`, `/judge/demo`) runs in memory, not
in the database. It needs the same next-round / ride-off steps so the whole
day can be rehearsed without touching real scores. Either extend the sample
engine with the same pure functions (preferred), or rehearse on a separate
Supabase project.

## 4. Order of work

| Step | What | Risk |
|---|---|---|
| 1 | A: next round in start order, no pools | small |
| 2 | B + C: who goes through, Start / Undo next round, Next step card | medium |
| 3 | Manual on/off switch | small |
| 4 | D: Final, ride-offs, automatic podium | largest |
| 5 | E: skip to end of pool, no-show block, late arrival | medium |
| 6 | F: practice mode support | medium |

Each step: its own migration (+ revert), tests, a scratch-database run,
localhost check, its own commit. The event is 11 Nov: steps 1–3 are the
only ones small enough to land before it; until step 4 lands, the podium is
entered by hand on the Scoring page as today.

## 5. Decisions (10 Nov, Mani)

1. **Ride-off order:** 3rd place first, then 1st/2nd, so the event ends on
   the winner.
2. A **single 0** that is the only rider left for a place (e.g. scores 4, 4,
   0) takes that place outright.
3. **No special name for a repeat.** When everyone in an Aarhi round gets 0,
   the same riders simply ride the **next numbered Aarhi round** (Round 4 all
   0 → the same riders ride Round 5). Every round on the screens is just
   "Aarhi Round 1, 2, 3, 4…".
4. After qualifier Round 3, the engine **prepares** Aarhi Round 1 (who is
   through, in start order) and an admin **confirms** it, like every other
   next round.
