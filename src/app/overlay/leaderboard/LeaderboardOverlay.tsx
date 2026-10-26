"use client";

import { useEffect, useState } from "react";
import { advanceText, standingsFor } from "@/components/scoring/format";
import { shortLocation } from "@/lib/scoring/types";
import { MessageBar, OverlayFrame, ResultChip, useOverlayState } from "../overlay-parts";

export const ROWS_PER_PAGE = 10;
export const PAGE_CYCLE_MS = 8_000;

/* Centred standings table. Follows the pool of the rider on course unless a
   pool is pinned (?pool=A) or the whole round is asked for (?all=1). Ten rows
   a page; longer tables cycle through their pages every eight seconds. */
export default function LeaderboardOverlay({
  pinnedPool,
  wholeRound,
}: {
  pinnedPool: string | null;
  wholeRound: boolean;
}) {
  const state = useOverlayState();
  const [tick, setTick] = useState(0);

  const live = state?.live ?? null;
  const round = state?.current_round ?? null;
  const pools = state?.pools ?? [];
  const followed = state?.current_run?.pool_label ?? live?.called_pool_label ?? pools[0] ?? null;
  const pool =
    wholeRound || pools.length === 0
      ? null
      : pinnedPool && pools.includes(pinnedPool)
        ? pinnedPool
        : followed;
  const rows = standingsFor(state?.leaderboard ?? [], pool);
  const pageCount = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));

  useEffect(() => {
    if (pageCount <= 1) {
      return;
    }

    const timer = setInterval(() => setTick((value) => value + 1), PAGE_CYCLE_MS);
    return () => clearInterval(timer);
  }, [pageCount]);

  if (
    !state ||
    !state.configured ||
    !live ||
    !round ||
    live.display_mode === "blank" ||
    live.display_mode === "pool_call" ||
    // "rider" is the rider on course alone (scorebug / lower third).
    live.display_mode === "rider"
  ) {
    return <OverlayFrame name="leaderboard" />;
  }

  if (live.display_mode === "message") {
    return (
      <OverlayFrame name="leaderboard">
        <MessageBar message={live.message} />
      </OverlayFrame>
    );
  }

  const page = tick % pageCount;
  const pageRows = rows.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);
  const isSection = round.event_type === "section";
  const byPool = pool !== null;

  return (
    <OverlayFrame name="leaderboard">
      <div className="ov-board ov-fade-in">
        <div className="ov-board__head">
          <div className="ov-board__title">{byPool ? `Pool ${pool} standings` : "Standings"}</div>
          <div className="ov-kicker">{round.name}</div>
        </div>
        <div key={`${pool ?? "all"}-${page}`} className="ov-fade-in">
          {pageRows.length === 0 ? (
            <div className="ov-board__row">
              <div className="ov-board__name">No results yet</div>
            </div>
          ) : (
            pageRows.map((row) => {
              const sub = isSection
                ? (row.members ?? []).map((member) => member.rider_name).join(" · ")
                : [row.horse_name, shortLocation(row.location)].filter(Boolean).join(" · ");
              const status = advanceText(row);

              return (
                <div key={row.entrant_key} className="ov-board__row">
                  <div className="ov-board__rank">{byPool ? row.pool_rank : row.rank}</div>
                  <div className="ov-board__name">
                    <div className="ov-ellipsis">{row.name}</div>
                    {sub && <small className="ov-ellipsis">{sub}</small>}
                  </div>
                  <div className="ov-board__best">
                    {isSection ? (
                      <span>
                        {row.runs_scored}/{row.runs_total}
                      </span>
                    ) : row.best_result ? (
                      <ResultChip result={row.best_result} />
                    ) : null}
                  </div>
                  <div className="ov-board__points">
                    {row.points}
                    {isSection && round.target_points ? (
                      <small style={{ fontSize: "0.55em", opacity: 0.7 }}>/{round.target_points}</small>
                    ) : null}
                  </div>
                  <div className="ov-board__through">{row.advanced ? status : ""}</div>
                </div>
              );
            })
          )}
        </div>
        {pageCount > 1 && (
          <div className="ov-board__foot">
            <span className="ov-kicker">{byPool ? `Pool ${pool}` : "Whole round"}</span>
            <span className="ov-kicker">
              {page + 1} / {pageCount}
            </span>
          </div>
        )}
      </div>
    </OverlayFrame>
  );
}
