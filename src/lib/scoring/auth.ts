// Role checks for the scoring routes and staff panels.
//
// Mirrors verifyAdminRequest in src/lib/admin/server.ts but accepts a list of
// roles, because judges and commentators are not administrators. Who is
// asking comes from the session token's verified claims (getVerifiedSession,
// shared with verifyAdminRequest), so a judge's tap costs no Auth round trip.
// The role is read from `profiles` under the caller's own session (RLS lets
// a user read their own row), never from anything the browser sends. The
// returned actor is what every audited database function records.
import "server-only";

import { NextResponse } from "next/server";
import type { VerifiedAuditActor } from "@/lib/admin/audit";
import { getVerifiedSession } from "@/lib/admin/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { isProfileRole, type ProfileRole } from "@/lib/scoring/types";

export type SessionRole = {
  userId: string;
  role: ProfileRole;
  actor: VerifiedAuditActor;
};

/* The signed-in user's role, or null when nobody is signed in. A profile row
   with an unknown role value is treated as "player" rather than trusted. */
export const getSessionRole = async (): Promise<SessionRole | null> => {
  const supabase = await createServerClient();
  const session = await getVerifiedSession(supabase);

  if (!session) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.userId)
    .maybeSingle();

  const role: ProfileRole = isProfileRole(profile?.role) ? profile.role : "player";

  return {
    userId: session.userId,
    role,
    actor: session.actor,
  };
};

/* For route handlers. Returns the actor when the caller holds one of the
   allowed roles, otherwise a ready-to-return 401/403 response. Administrators
   are not implicitly allowed — list "admin" explicitly where they should be. */
export const verifyRoleRequest = async (allowed: readonly ProfileRole[]) => {
  const session = await getSessionRole();
  // A refusal depends on the caller's cookies, so it must never be cached.
  const headers = { "Cache-Control": "private, no-store" };

  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Authentication required." },
        { status: 401, headers }
      ),
    };
  }

  if (!allowed.includes(session.role)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "You do not have access to this panel." },
        { status: 403, headers }
      ),
    };
  }

  return { ok: true as const, actor: session.actor, role: session.role };
};
