// Column lists of the four vMix data sources, in the order the endpoints send
// them. One place, imported by the row builders (vmix.ts) and by the /overlay
// setup page, so the page can never document a column the feed does not send.
// No imports: the page and the node test runner both load this file directly.
//
// Every row type ends with `sample` ("Yes" / "No"): "Yes" only for the
// rehearsal rows of ?sample=1, so a title can show a SAMPLE badge.

export const VMIX_CURRENT_COLUMNS = [
  "round_name",
  "event_type",
  "round_number",
  "pool_label",
  "next_pool_label",
  "rider_name",
  "team_name",
  "horse_name",
  "location_short",
  "attempt_number",
  "attempts_per_rider",
  "run_order",
  "runs_total",
  "display_mode",
  "message",
  "last_rider_name",
  "last_team_name",
  "last_result",
  "last_points",
  "last_scored_at",
  "updated_at",
  "sample",
] as const;

export const VMIX_LEADERBOARD_COLUMNS = [
  "rank",
  "pool_rank",
  "pool_label",
  "name",
  "team_name",
  "horse_name",
  "location_short",
  "points",
  "best_result",
  "runs_scored",
  "runs_total",
  "advanced",
  "sample",
] as const;

export const VMIX_ENTRANTS_COLUMNS = [
  "entrant_key",
  "pool_label",
  "start_position",
  "name",
  "team_name",
  "horse_name",
  "location_short",
  "members",
  "runs_total",
  "runs_scored",
  "points",
  "best_result",
  "advanced",
  "rank",
  "pool_rank",
  "sample",
] as const;

export const VMIX_ROUNDS_COLUMNS = [
  "round_id",
  "name",
  "event_type",
  "round_number",
  "status",
  "is_live",
  "attempts_per_rider",
  "target_points",
  "pool_size",
  "pool_count",
  "entrants",
  "runs_total",
  "runs_scored",
  "sample",
] as const;

/* The rehearsal rounds of ?sample=1 (vmix-sample.ts), fixed so a graphics
   team can bookmark them: entrants?sample=1&round=<section id> shows a
   Section round's sides with their four riders. */
export const VMIX_SAMPLE_QUALIFICATION_ROUND_ID = "5a3b1e00-0000-4000-8000-000000000001";
export const VMIX_SAMPLE_SECTION_ROUND_ID = "5a3b1e00-0000-4000-8000-000000000002";

/* The four feeds, for the /overlay setup page. `path` is relative to the
   site; `example` is a query worth showing. */
export const VMIX_FEEDS = [
  {
    path: "/api/live/vmix/current",
    title: "Current",
    rows: "One row: the round, the pool riding and the next one, the rider on course, the attempt, the screens' mode and message, and the last result.",
    columns: VMIX_CURRENT_COLUMNS,
    example: "",
  },
  {
    path: "/api/live/vmix/leaderboard",
    title: "Leaderboard",
    rows: "One row per entrant in the current round, ranked. ?pool=A keeps one pool (ranked within it); ?limit=10 caps the rows (default 50, at most 200).",
    columns: VMIX_LEADERBOARD_COLUMNS,
    example: "?pool=A",
  },
  {
    path: "/api/live/vmix/entrants",
    title: "Entrants",
    rows: "One row per entrant in start order — the start list with each entrant's progress. Section rows list the four riders in members. ?round=<round_id> for another round.",
    columns: VMIX_ENTRANTS_COLUMNS,
    example: "",
  },
  {
    path: "/api/live/vmix/rounds",
    title: "Rounds",
    rows: "One row per round in running order, with is_live, pool and entrant counts and progress. Its round_id values are what ?round= takes.",
    columns: VMIX_ROUNDS_COLUMNS,
    example: "",
  },
] as const;
