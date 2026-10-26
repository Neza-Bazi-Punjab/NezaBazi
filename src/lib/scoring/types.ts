// Shared contract for live scoring: database row shapes, API payloads and the
// vocabulary every panel (judge, commentator, public scoreboard, stream
// overlay) speaks. Both the server routes and the browser import from here, so
// it carries no "server-only" import and no runtime dependencies.
//
// Field names are snake_case on purpose: they mirror the Postgres columns and
// the rest of the app already renders registration rows the same way.

/* Roles ------------------------------------------------------------------- */

export const PROFILE_ROLES = ["player", "judge", "commentator", "admin"] as const;
export type ProfileRole = (typeof PROFILE_ROLES)[number];

/* Roles that may open the staff panels. Administrators can do everything a
   judge or commentator can. */
export const STAFF_ROLES = ["judge", "commentator", "admin"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const isProfileRole = (value: unknown): value is ProfileRole =>
  typeof value === "string" && (PROFILE_ROLES as readonly string[]).includes(value);

/* Competition vocabulary --------------------------------------------------- */

/* "single" is Single Tent Pegging (one rider, one peg); "section" is the
   four-rider team event. Both are described on /event. */
export type EventType = "single" | "section";
export const EVENT_TYPES: readonly EventType[] = ["single", "section"];

export type RoundStatus = "upcoming" | "live" | "complete";
export const ROUND_STATUSES: readonly RoundStatus[] = ["upcoming", "live", "complete"];

/* pending: waiting in the start list. on_course: the rider the judges are
   watching right now. scored: a result is recorded. void: the run will not
   happen (rider already qualified, scratched, or the pass was cancelled). */
export type RunStatus = "pending" | "on_course" | "scored" | "void";
export const RUN_STATUSES: readonly RunStatus[] = ["pending", "on_course", "scored", "void"];

/* The three outcomes a judge can record. Points match the published rules:
   a carried peg is 4, a struck peg is 2, a miss is 0. The database computes
   `points` from `result` with the same table, so never send points from the
   browser. */
export type RunResult = "carry" | "strike" | "miss";
export const RUN_RESULTS: readonly RunResult[] = ["carry", "strike", "miss"];
export const RESULT_POINTS: Record<RunResult, number> = { carry: 4, strike: 2, miss: 0 };
export const RESULT_LABELS: Record<RunResult, string> = {
  carry: "Carried",
  strike: "Struck",
  miss: "Miss",
};

export const isRunResult = (value: unknown): value is RunResult =>
  typeof value === "string" && (RUN_RESULTS as readonly string[]).includes(value);

/* What the public scoreboard and stream overlays should be showing. "blank"
   hides every overlay (for a break or the cavalcade); "message" shows only the
   message text; "pool_call" shows the roster of `called_pool_label` with a
   "get ready" banner — riders are brought to the start by pool, and this is
   how they are told their pool is up. Recording the first result of the called
   pool returns the mode to "scoreboard". */
export type DisplayMode =
  | "scoreboard"
  | "leaderboard"
  | "rider"
  | "pool_call"
  | "message"
  | "blank";
export const DISPLAY_MODES: readonly DisplayMode[] = [
  "scoreboard",
  "leaderboard",
  "rider",
  "pool_call",
  "message",
  "blank",
];

/* Database rows ------------------------------------------------------------ */

export type PodiumEntry = {
  place: 1 | 2 | 3;
  entrant_key: string;
  name: string;
};

export type ScoringRound = {
  id: string;
  event_type: EventType;
  name: string;
  /* 0 is the Single qualification round; knockout rounds count from 1. */
  round_number: number;
  /* 3 for the Single qualification round, otherwise 1. */
  attempts_per_rider: number;
  /* Section rounds only: 8, 12 or 16. Null for Single rounds, where a carry
     is the only way through. */
  target_points: number | null;
  status: RoundStatus;
  sort_order: number;
  /* Riders (Single) or teams (Section) are drawn into pools of about this many
     entrants — "Pool A", "Pool B", … — balanced so no pool differs from another
     by more than one. Null means the round is not split into pools. */
  pool_size: number | null;
  /* Set by an administrator once a final has been decided. Null until then. */
  podium: PodiumEntry[] | null;
  created_at: string;
  updated_at: string;
};

/* Pools are labelled A, B, C … in draw order. */
export const poolLabelForIndex = (index: number) => {
  let label = "";
  let remaining = index;

  do {
    label = String.fromCharCode(65 + (remaining % 26)) + label;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);

  return label;
};

/* Splits `count` entrants into balanced pools of about `poolSize`: the number
   of pools is ceil(count / poolSize) and sizes differ by at most one, so 25
   riders at a pool size of 10 become three pools of 9, 8 and 8 rather than
   10, 10 and 5. Returns the size of each pool in label order. The database
   builder must produce exactly these sizes. */
export const balancedPoolSizes = (count: number, poolSize: number): number[] => {
  if (count <= 0 || poolSize <= 0) {
    return [];
  }

  const pools = Math.ceil(count / poolSize);
  const base = Math.floor(count / pools);
  const remainder = count % pools;

  return Array.from({ length: pools }, (_, index) => base + (index < remainder ? 1 : 0));
};

/* One pass of one rider at one peg. Carries a public display snapshot of the
   rider so the scoreboard, the overlays and anonymous visitors never read the
   registration tables. The snapshot holds only what is announced over the PA:
   name, horse, team and home location. Never age, phone, email, parents or
   emergency contacts. */
export type ScoringRun = {
  id: string;
  round_id: string;
  /* 1-based position in the round's start list. Unique within a round. */
  run_order: number;
  /* 1-based attempt for this rider in this round. */
  attempt_number: number;
  /* "A", "B", … when the round is drawn into pools; null otherwise. Every run
     of one entrant in one round carries the same label. */
  pool_label: string | null;
  /* "solo:<solo_registration_id>" for the Single event, "team:<team_id>" for a
     Section run. Groups a team's four riders and a rider's attempts. */
  entrant_key: string;
  solo_registration_id: string | null;
  team_member_id: string | null;
  team_id: string | null;
  rider_name: string;
  horse_name: string | null;
  team_name: string | null;
  rider_location: string | null;
  status: RunStatus;
  result: RunResult | null;
  /* Generated by the database from `result`. */
  points: number | null;
  scored_by: string | null;
  scored_at: string | null;
  created_at: string;
  updated_at: string;
};

/* Single-row table. */
export type LiveState = {
  current_round_id: string | null;
  current_run_id: string | null;
  /* The pool most recently called to the start area. Normally the pool of the
     current run; set ahead of it by "Call Pool X" so the next pool can get
     ready while the last riders of the previous pool finish. */
  called_pool_label: string | null;
  display_mode: DisplayMode;
  message: string | null;
  updated_at: string;
};

/* One entrant in a pool roster: what the "get ready" screen lists. */
export type PoolRosterEntry = {
  entrant_key: string;
  name: string;
  team_name: string | null;
  horse_name: string | null;
  /* Section only: the four riders' names in riding order. */
  members?: string[];
};

/* One row of a round's standings. For a Single round an entrant is a rider;
   for a Section round it is a team and `members` lists the four riders. */
export type LeaderboardRow = {
  entrant_key: string;
  /* Rank within the whole round. */
  rank: number;
  /* Rank within the entrant's pool; equals `rank` when the round has no pools. */
  pool_rank: number;
  pool_label: string | null;
  name: string;
  team_name: string | null;
  horse_name: string | null;
  location: string | null;
  points: number;
  best_result: RunResult | null;
  runs_scored: number;
  runs_total: number;
  /* Null while the round is undecided for this entrant (runs still pending),
     otherwise whether they go through under the round's rule — or, when an
     administrator has recorded an override for this entrant, that override. */
  advanced: boolean | null;
  /* True when `advanced` comes from an administrator's override. */
  advanced_overridden: boolean;
  members?: {
    team_member_id: string | null;
    rider_name: string;
    horse_name: string | null;
    result: RunResult | null;
    points: number | null;
    status: RunStatus;
  }[];
};

/* API payloads ------------------------------------------------------------- */

/* GET /api/live/state — public, no personal data. */
export type PublicLiveState = {
  /* False when the scoring migration has not been applied yet. Every panel
     must render a calm "live scoring begins on event day" state on false. */
  configured: boolean;
  generated_at: string;
  live: LiveState | null;
  current_round: ScoringRound | null;
  current_run: ScoringRun | null;
  /* The most recently scored run anywhere today — what the result flash shows. */
  last_scored_run: ScoringRun | null;
  /* The last 8 scored runs in the current round, newest first, so the ticker
     and the commentators' "recent results" never depend on what one browser
     happened to see since it was opened. */
  recent_results: ScoringRun[];
  /* Next pending runs in the current round, in start order. At most 5. */
  up_next: ScoringRun[];
  /* Standings for the current round, every pool together, ranked overall.
     Group by `pool_label` and sort by `pool_rank` for the per-pool tables. */
  leaderboard: LeaderboardRow[];
  /* Pool labels present in the current round, in order. Empty when unpooled. */
  pools: string[];
  /* Who is in each pool of the current round, keyed by label, in start order
     (one entry per entrant, not per attempt). Drives the "Pool B, get ready"
     screen and the pools tab. Unpooled rounds use the key "" for everyone. */
  pool_rosters: Record<string, PoolRosterEntry[]>;
  /* The pool after `live.called_pool_label` in the current round, or null when
     the called pool is the last one. Shown as "Next: Pool C". */
  next_pool_label: string | null;
  /* Every round in sort order, so the scoreboard can show completed rounds. */
  rounds: ScoringRound[];
};

/* Everything the commentators need to introduce a rider. Staff only. */
export type RiderDetail = {
  full_name: string;
  father_name: string | null;
  mother_name: string | null;
  age: number | null;
  location: string | null;
  years_experience: number | null;
  horse_name: string | null;
  horse_age: number | null;
  horse_breed: string | null;
  team_name: string | null;
  is_leader: boolean | null;
  /* Short-lived signed URL to the rider's headshot, when they uploaded one. */
  headshot_url: string | null;
  /* Every run this rider has today, oldest first. */
  today: {
    round_name: string;
    attempt_number: number;
    result: RunResult | null;
    points: number | null;
    status: RunStatus;
  }[];
  total_points_today: number;
};

/* GET /api/commentary/state — judge, commentator or admin. */
export type CommentaryState = PublicLiveState & {
  current_rider: RiderDetail | null;
  up_next_riders: (ScoringRun & { rider: RiderDetail })[];
  /* Standings for every round, keyed by round id, for the "earlier today" column. */
  leaderboards_by_round: Record<string, LeaderboardRow[]>;
};

/* GET /api/judge/state — judge or admin. */
export type JudgeState = PublicLiveState & {
  /* The full start list of the current round, in run order. */
  runs: ScoringRun[];
};

export type ScoreRequest = {
  run_id: string;
  result: RunResult;
  /* Required to change a result that is already recorded. */
  override?: boolean;
};

/* `make_current` puts the rider back on course in the same transaction — the
   "undo last result" path, which must not leave the pointer on the next rider
   while this one's result is gone. */
export type ClearScoreRequest = { run_id: string; make_current?: boolean };

export type RunStatusRequest = { run_id: string; status: "pending" | "void" };

/* Partial update: only the keys present are applied. */
export type LiveUpdateRequest = {
  current_round_id?: string | null;
  current_run_id?: string | null;
  called_pool_label?: string | null;
  display_mode?: DisplayMode;
  message?: string | null;
};

/* "Call Pool B": makes the round current, points the live run at the first
   pending run of that pool, records the pool as called and switches the
   display to "pool_call". */
export type CallPoolRequest = {
  round_id: string;
  pool_label: string;
};

export type RoundInput = {
  event_type: EventType;
  name: string;
  round_number: number;
  attempts_per_rider: number;
  target_points: number | null;
  sort_order: number;
  pool_size: number | null;
};

export type RoundPatch = Partial<RoundInput> & {
  status?: RoundStatus;
  podium?: PodiumEntry[] | null;
};

/* "all_checked_in": every checked-in solo rider (Single) or every team whose
   four riders have all checked in (Section). "advanced": the entrants marked
   advanced in the previous round of the same event type. The draw is always
   randomized; pools follow the round's pool_size (see balancedPoolSizes). */
export type StartListRequest = {
  mode: "all_checked_in" | "advanced";
};

/* Administrator override of whether an entrant goes through, e.g. after a
   disqualification or a re-run ordered by the chief judge. `advanced: null`
   removes the override and the round's rule applies again. */
export type AdvanceOverrideRequest = {
  round_id: string;
  entrant_key: string;
  advanced: boolean | null;
  note?: string | null;
};

/* Move one entrant (and every run they have in the round) into another pool. */
export type PoolMoveRequest = {
  round_id: string;
  entrant_key: string;
  pool_label: string;
};

export type ApiError = { error: string };

/* Helpers ------------------------------------------------------------------ */

export const entrantKeyForSolo = (soloRegistrationId: string) =>
  `solo:${soloRegistrationId}`;

export const entrantKeyForTeam = (teamId: string) => `team:${teamId}`;

/* "Ladhewali, Jalandhar, Punjab, India" → "Jalandhar, Punjab". The village is
   the rider's own address; the district and state are what an announcer says.

   The SQL twin is public.scoring_short_location in
   supabase/migrations/20261026100000_scoring_short_location.sql, which the run
   insert trigger applies before a snapshot is stored. The two must agree
   (trim = String.prototype.trim(), which the SQL spells out character by
   character); the migration's own check and public-state.test.mts run the
   same five fixtures:
     "Rehearsal Village, Amritsar, Punjab, India" → "Amritsar, Punjab"
     "Amritsar, Punjab"                           → "Amritsar, Punjab"
     " Amritsar "                                 → "Amritsar"
     ",,"                                         → null
     ""                                           → null */
export const shortLocation = (location: string | null | undefined) => {
  if (!location) {
    return null;
  }

  const parts = location
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 2) {
    return parts.join(", ") || null;
  }

  return parts.slice(-3, -1).join(", ");
};

/* Public payloads ----------------------------------------------------------- */

/* What a public payload (GET /api/live/state and the vMix feeds) may carry
   about a run: the judge who scored it is staff data, and the rider's home is
   cut to district and state. server.ts applies these as it assembles every
   public response, so the registered village never leaves the server on a
   public route whatever a client does with the payload. The staff states
   (judge, commentary) are built without them: the announcer may want the
   village, which the commentary panel reads from the registration once
   migration 20261026100000 stores runs with district and state only.
   shortLocation is idempotent, so a surface that shortens again shows the
   same thing. */
export const toPublicRun = (run: ScoringRun): ScoringRun => ({
  ...run,
  rider_location: shortLocation(run.rider_location),
  scored_by: null,
});

export const toPublicLeaderboardRow = (row: LeaderboardRow): LeaderboardRow => ({
  ...row,
  location: shortLocation(row.location),
});

/* Every run and standings row of a public live state. Pool rosters, rounds
   and the live row carry no location or judge. */
export const toPublicLiveState = (state: PublicLiveState): PublicLiveState => ({
  ...state,
  current_run: state.current_run ? toPublicRun(state.current_run) : null,
  last_scored_run: state.last_scored_run ? toPublicRun(state.last_scored_run) : null,
  recent_results: state.recent_results.map(toPublicRun),
  up_next: state.up_next.map(toPublicRun),
  leaderboard: state.leaderboard.map(toPublicLeaderboardRow),
});
