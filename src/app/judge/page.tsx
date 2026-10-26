import type { Metadata, Viewport } from "next";
import { unstable_rethrow } from "next/navigation";
import StaffGate from "@/components/scoring/StaffGate";
import { getSessionRole, type SessionRole } from "@/lib/scoring/auth";
import JudgePanel from "./JudgePanel";

export const metadata: Metadata = {
  title: "Judges' Panel",
  description: "Record results during the championship.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#2e1d0e",
};

// Reads the session on every request; never prerendered.
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["judge", "admin"] as const;

export default async function JudgePage() {
  let session: SessionRole | null;

  try {
    session = await getSessionRole();
  } catch (error) {
    // Let Next's own control-flow errors (dynamic rendering, redirects)
    // through; only a real failure renders the "try again" gate.
    unstable_rethrow(error);
    console.error("Unable to check access to the judges' panel", error);
    return (
      <StaffGate
        kind="error"
        title="Judges' Panel"
        audience="judges and administrators"
        redirectTo="/judge"
      />
    );
  }

  if (!session) {
    return (
      <StaffGate
        kind="login"
        title="Judges' Panel"
        audience="judges and administrators"
        redirectTo="/judge"
      />
    );
  }

  if (!(ALLOWED_ROLES as readonly string[]).includes(session.role)) {
    return (
      <StaffGate
        kind="denied"
        title="Judges' Panel"
        audience="judges and administrators"
        redirectTo="/judge"
      />
    );
  }

  return <JudgePanel />;
}
