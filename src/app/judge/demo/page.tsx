import type { Metadata, Viewport } from "next";
import { unstable_rethrow } from "next/navigation";
import StaffGate from "@/components/scoring/StaffGate";
import { getSessionRole, type SessionRole } from "@/lib/scoring/auth";
import { STAFF_ROLES } from "@/lib/scoring/types";
import JudgePanel from "../JudgePanel";

// /judge/demo — the judges' panel in training mode: sample riders held in the
// server's memory, nothing written to the database.
//
//   - On a laptop started with SCORING_SAMPLE_MODE=1 (in .env.local): open to
//     anyone, no login, one practice session shared by everyone using it.
//   - Everywhere else, the live site included: signed-in judges, commentators
//     and administrators only, each on their own practice session; everyone
//     else sees the same Login / Access Denied page as /judge.
//
// The API routes enforce the same rule on every request (sample-mode.ts);
// this page only decides what to render. See docs/event-day-runbook.md,
// "Training mode".
export const metadata: Metadata = {
  title: "Judges' Panel — Training",
  description: "Practise recording results on sample riders.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#2e1d0e",
};

// Reads the environment and the session on every request; never prerendered.
export const dynamic = "force-dynamic";

const TITLE = "Judges' Panel — Training";
const AUDIENCE = "judges, commentators and administrators";

export default async function JudgeDemoPage() {
  if (process.env.SCORING_SAMPLE_MODE === "1") {
    return <JudgePanel sample="shared" />;
  }

  let session: SessionRole | null;

  try {
    session = await getSessionRole();
  } catch (error) {
    unstable_rethrow(error);
    console.error("Unable to check access to the judges' practice panel", error);
    return <StaffGate kind="error" title={TITLE} audience={AUDIENCE} redirectTo="/judge/demo" />;
  }

  if (!session) {
    return <StaffGate kind="login" title={TITLE} audience={AUDIENCE} redirectTo="/judge/demo" />;
  }

  // Practice is open to every staff role: judges, commentators, administrators.
  if (!(STAFF_ROLES as readonly string[]).includes(session.role)) {
    return <StaffGate kind="denied" title={TITLE} audience={AUDIENCE} redirectTo="/judge/demo" />;
  }

  return <JudgePanel sample="personal" />;
}
