"use client";

import { useResultFlash } from "@/components/scoring/ResultFlash";
import { poolName } from "@/components/scoring/format";
import {
  MessageBar,
  NowNextLine,
  OverlayFrame,
  ResultChip,
  useOverlayState,
} from "../overlay-parts";

/* Compact top-left bug: round · pool, the rider on course and their team or
   horse. When a result is recorded, the scored rider and the result show
   for four seconds before the bug moves on to the next rider. */
export default function ScorebugOverlay() {
  const state = useOverlayState();
  const flashing = useResultFlash(state?.last_scored_run, state !== null);
  const live = state?.live ?? null;
  const round = state?.current_round ?? null;

  // "leaderboard" leaves the frame to the full leaderboard overlay.
  if (
    !state ||
    !state.configured ||
    !live ||
    live.display_mode === "blank" ||
    live.display_mode === "leaderboard"
  ) {
    return <OverlayFrame name="scorebug" />;
  }

  if (live.display_mode === "message") {
    return (
      <OverlayFrame name="scorebug">
        <MessageBar message={live.message} />
      </OverlayFrame>
    );
  }

  if (live.display_mode === "pool_call") {
    return (
      <OverlayFrame name="scorebug">
        <div className="ov-bug">
          <NowNextLine state={state} />
        </div>
      </OverlayFrame>
    );
  }

  if (!round) {
    return <OverlayFrame name="scorebug" />;
  }

  const shown = flashing ?? state.current_run;
  const detail = shown ? (shown.team_name ?? shown.horse_name) : null;

  return (
    <OverlayFrame name="scorebug">
      <div className="ov-bug">
        <div className="ov-panel ov-bug__box">
          <div className="ov-kicker ov-ellipsis">
            {[round.name, poolName(shown?.pool_label ?? live.called_pool_label)]
              .filter(Boolean)
              .join(" · ")}
          </div>
          {shown ? (
            <div key={`${shown.id}-${flashing ? "flash" : "live"}`} className="ov-fade-in">
              <div className="ov-bug__name ov-ellipsis">{shown.rider_name}</div>
              {detail && <div className="ov-bug__sub ov-ellipsis">{detail}</div>}
              {flashing?.result && (
                <div className="ov-bug__flash ov-pop">
                  <ResultChip result={flashing.result} />
                </div>
              )}
            </div>
          ) : (
            <div className="ov-bug__sub">Next rider coming up</div>
          )}
        </div>
        <NowNextLine state={state} />
      </div>
    </OverlayFrame>
  );
}
