// The team on the track in a Section round, with all of its riders.
//
// A team's riders go down the track together, so the commentary panel and the
// broadcast show the whole side at once: every rider's name, horse and result,
// and the side's points against the round's target. Built from the standings
// already in the live state (a Section row lists its riders), so it carries
// nothing the leaderboard does not.
//
// Pure and import-free (structural types only), so the server, the panels and
// `node --test` can all load it.

type Member = {
  rider_name: string;
  horse_name: string | null;
  result: string | null;
  points: number | null;
  status: string;
};

type Row = {
  entrant_key: string;
  name: string;
  pool_label: string | null;
  rank: number;
  points: number;
  advanced: boolean | null;
  members?: Member[];
};

type RunRef = { entrant_key: string } | null;

export type TeamState = {
  current_round: { event_type: string; target_points: number | null } | null;
  current_run: RunRef;
  last_scored_run: RunRef;
  up_next: { entrant_key: string }[];
  leaderboard: Row[];
};

export type TeamOnTrack = {
  entrant_key: string;
  name: string;
  pool_label: string | null;
  rank: number;
  points: number;
  target: number | null;
  /* Null until every rider of the side has a result (or is out). */
  through: boolean | null;
  /* "on_track" once Start has been tapped or a rider has a result while
     others are still to score; "next" before that; "finished" when every
     rider has a result. */
  stage: "next" | "on_track" | "finished";
  members: Member[];
};

const isOpen = (member: Member) => member.status === "pending" || member.status === "on_course";

/* "now": the side with a rider on course; else the side that has started and
   still has a rider to score; else the next side to ride; else the side that
   rode last. "last": the side whose result came in most recently. Null
   outside a Section round. */
export const teamOnTrack = (state: TeamState | null, which: "now" | "last" = "now"): TeamOnTrack | null => {
  if (!state || state.current_round?.event_type !== "section") {
    return null;
  }

  const byKey = new Map(state.leaderboard.map((row) => [row.entrant_key, row]));
  const lastKey = state.last_scored_run?.entrant_key ?? null;
  const lastRow = lastKey ? byKey.get(lastKey) : undefined;
  const unfinished = lastRow?.members?.some(isOpen) ? lastKey : null;

  const key =
    which === "last"
      ? lastKey
      : (state.current_run?.entrant_key ?? unfinished ?? state.up_next[0]?.entrant_key ?? lastKey);
  const row = key ? byKey.get(key) : undefined;

  if (!row) {
    return null;
  }

  const members = row.members ?? [];
  const open = members.filter(isOpen).length;
  const started =
    state.current_run?.entrant_key === row.entrant_key ||
    members.some((member) => member.status === "scored" || member.status === "on_course");

  return {
    stage: members.length > 0 && open === 0 ? "finished" : started ? "on_track" : "next",
    entrant_key: row.entrant_key,
    name: row.name,
    pool_label: row.pool_label,
    rank: row.rank,
    points: row.points,
    target: state.current_round.target_points,
    through: row.advanced,
    members,
  };
};
