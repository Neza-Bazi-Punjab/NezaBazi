import type { Metadata, Viewport } from "next";
import { unstable_rethrow } from "next/navigation";
import StaffGate from "@/components/scoring/StaffGate";
import { getSessionRole, type SessionRole } from "@/lib/scoring/auth";
import CommentaryPanel from "./CommentaryPanel";

export const metadata: Metadata = {
  title: "Commentary",
  description: "Rider information for the championship commentators.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#2e1d0e",
};

// Reads the session on every request; never prerendered.
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["judge", "commentator", "admin"] as const;
const AUDIENCE = "commentators, judges and administrators";

export default async function CommentaryPage() {
  let session: SessionRole | null;

  try {
    session = await getSessionRole();
  } catch (error) {
    // Let Next's own control-flow errors (dynamic rendering, redirects)
    // through; only a real failure renders the "try again" gate.
    unstable_rethrow(error);
    console.error("Unable to check access to the commentary panel", error);
    return (
      <StaffGate kind="error" title="Commentary" audience={AUDIENCE} redirectTo="/commentary" />
    );
  }

  if (!session) {
    return (
      <StaffGate kind="login" title="Commentary" audience={AUDIENCE} redirectTo="/commentary" />
    );
  }

  if (!(ALLOWED_ROLES as readonly string[]).includes(session.role)) {
    return (
      <StaffGate kind="denied" title="Commentary" audience={AUDIENCE} redirectTo="/commentary" />
    );
  }

  return <CommentaryPanel />;
}
