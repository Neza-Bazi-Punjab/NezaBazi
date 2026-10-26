import type { Metadata, Viewport } from "next";
import { unstable_rethrow } from "next/navigation";
import StaffGate from "@/components/scoring/StaffGate";
import { getSessionRole, type SessionRole } from "@/lib/scoring/auth";
import { STAFF_ROLES } from "@/lib/scoring/types";
import CommentaryPanel from "../CommentaryPanel";

// /commentary/demo — the commentary panel in training mode: it follows the
// practice session that /judge/demo drives, with invented rider backgrounds.
// Nothing is read from or written to the database.
//
//   - On a laptop started with SCORING_SAMPLE_MODE=1 (in .env.local): open to
//     anyone, no login, one practice session shared by everyone using it.
//   - Everywhere else, the live site included: signed-in judges, commentators
//     and administrators only, each following their own practice session
//     (open /judge/demo on a phone with the same account to drive it);
//     everyone else sees the same Login / Access Denied page as /commentary.
//
// The API routes enforce the same rule on every request (sample-mode.ts);
// this page only decides what to render. See docs/event-day-runbook.md,
// "Training mode".
export const metadata: Metadata = {
  title: "Commentary — Training",
  description: "Practise with the commentary panel on sample riders.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#2e1d0e",
};

// Reads the environment and the session on every request; never prerendered.
export const dynamic = "force-dynamic";

const TITLE = "Commentary — Training";
const AUDIENCE = "judges, commentators and administrators";

export default async function CommentaryDemoPage() {
  if (process.env.SCORING_SAMPLE_MODE === "1") {
    return <CommentaryPanel sample="shared" />;
  }

  let session: SessionRole | null;

  try {
    session = await getSessionRole();
  } catch (error) {
    unstable_rethrow(error);
    console.error("Unable to check access to the commentary practice panel", error);
    return (
      <StaffGate kind="error" title={TITLE} audience={AUDIENCE} redirectTo="/commentary/demo" />
    );
  }

  if (!session) {
    return (
      <StaffGate kind="login" title={TITLE} audience={AUDIENCE} redirectTo="/commentary/demo" />
    );
  }

  // Practice is open to every staff role: judges, commentators, administrators.
  if (!(STAFF_ROLES as readonly string[]).includes(session.role)) {
    return (
      <StaffGate kind="denied" title={TITLE} audience={AUDIENCE} redirectTo="/commentary/demo" />
    );
  }

  return <CommentaryPanel sample="personal" />;
}
