import type { Metadata } from "next";
import LeaderboardOverlay from "./LeaderboardOverlay";

export const metadata: Metadata = {
  title: "Leaderboard overlay",
};

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/* ?pool=A pins a pool (labels are one or two capital letters); ?all=1 shows
   the whole round. Anything else is ignored. */
export default async function LeaderboardOverlayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const pool = first(params.pool)?.trim().toUpperCase() ?? "";
  const all = first(params.all);

  return (
    <LeaderboardOverlay
      pinnedPool={/^[A-Z]{1,2}$/.test(pool) ? pool : null}
      wholeRound={all === "1" || all === "true"}
    />
  );
}
