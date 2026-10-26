"use client";

import { rosterFor } from "@/components/scoring/format";
import { MessageBar, OverlayFrame, useOverlayState } from "../overlay-parts";

/* Full-frame "Pool B — get ready" roster, shown only while the display mode
   is pool_call (transparent otherwise). Two columns for up to twelve names,
   three when the pool is larger or lists team riders. */
export default function PoolCallOverlay() {
  const state = useOverlayState();
  const live = state?.live ?? null;

  if (!state || !state.configured || !live) {
    return <OverlayFrame name="pool-call" />;
  }

  if (live.display_mode === "message") {
    return (
      <OverlayFrame name="pool-call">
        <MessageBar message={live.message} />
      </OverlayFrame>
    );
  }

  const called = live.called_pool_label;

  if (live.display_mode !== "pool_call" || !called) {
    return <OverlayFrame name="pool-call" />;
  }

  const entries = rosterFor(state.pool_rosters, called);
  const hasMembers = entries.some((entry) => (entry.members?.length ?? 0) > 0);
  const dense = entries.length > 12 || (hasMembers && entries.length > 6);
  const next = state.next_pool_label;

  return (
    <OverlayFrame name="pool-call">
      <div key={called} className="ov-call ov-fade-in">
        {state.current_round && <div className="ov-kicker">{state.current_round.name}</div>}
        <div className="ov-call__title">Pool {called} — get ready</div>
        <ol className={`ov-call__list ${dense ? "ov-call__list--dense" : ""}`}>
          {entries.map((entry, index) => (
            <li key={entry.entrant_key}>
              <b>{index + 1}</b>
              <span style={{ minWidth: 0 }}>
                <span className="ov-ellipsis" style={{ display: "block" }}>
                  {entry.name}
                </span>
                {entry.members && entry.members.length > 0 && (
                  <small className="ov-ellipsis">{entry.members.join(" · ")}</small>
                )}
              </span>
            </li>
          ))}
        </ol>
        {next && next !== called && <div className="ov-call__foot">Next: Pool {next}</div>}
      </div>
    </OverlayFrame>
  );
}
