import "server-only";

import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import {
  buildAuditRecord,
  requireAuditSuccess,
  type AuditEntryInput,
  type VerifiedAuditActor,
} from "@/lib/admin/audit";
import { createClient as createServerClient } from "@/lib/supabase/server";

const getMetadataString = (metadata: object | null | undefined, key: string) => {
  if (!metadata || !(key in metadata)) {
    return "";
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
};

type ServerSupabase = Awaited<ReturnType<typeof createServerClient>>;

export type VerifiedSession = { userId: string; actor: VerifiedAuditActor };

/* Who is signed in, read only from the session token's verified claims.
   getClaims() checks the token's signature locally against the project's
   published signing key (ES256, fetched once and cached), so this costs no
   round trip to the Auth server; with a symmetric (HS256) key the library
   asks the Auth server itself. Identity is only ever the verified `sub`. A
   missing, expired or invalid token, or any failure verifying it, counts as
   signed out. The actor carries the same values the audit log recorded when
   this read the user from the Auth server. Shared by verifyAdminRequest, the
   admin pages' gate (admin-access.tsx) and the scoring role check. */
export const getVerifiedSession = async (
  supabase: ServerSupabase
): Promise<VerifiedSession | null> => {
  let claims;

  try {
    const { data, error } = await supabase.auth.getClaims();

    if (error || !data?.claims) {
      return null;
    }

    claims = data.claims;
  } catch (error) {
    // The library returns ordinary auth errors rather than throwing, so only
    // something unusual (such as a token with an unknown algorithm) gets
    // here. Never let it through: signed out.
    console.error("[auth] session token could not be verified", error);
    return null;
  }

  const userId = claims.sub;

  if (typeof userId !== "string" || userId === "") {
    return null;
  }

  const email = typeof claims.email === "string" ? claims.email : null;
  const fullName = getMetadataString(claims.user_metadata, "full_name").trim();

  return {
    userId,
    actor: {
      id: userId,
      name: fullName || email || null,
      email,
    },
  };
};

export const verifyAdminRequest = async () => {
  const supabase = await createServerClient();
  const session = await getVerifiedSession(supabase);

  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    };
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.userId)
    .maybeSingle();

  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: error.message }, { status: 400 }),
    };
  }

  if (profile?.role !== "admin") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Admin access required." }, { status: 403 }),
    };
  }

  return { ok: true as const, actor: session.actor };
};

export const createServiceRoleClient = () =>
  createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

export type ServiceRoleClient = ReturnType<typeof createServiceRoleClient>;

export const insertRequiredAuditLog = async (
  serviceSupabase: ServiceRoleClient,
  actor: VerifiedAuditActor,
  entry: AuditEntryInput
) => {
  const { data, error } = await serviceSupabase
    .from("admin_audit_log")
    .insert(buildAuditRecord(actor, entry))
    .select("id")
    .single();

  requireAuditSuccess(error);

  if (!data?.id) {
    throw new Error("Unable to record the admin action.");
  }

  return data.id as string;
};

export const updateRequiredAuditLog = async (
  serviceSupabase: ServiceRoleClient,
  auditId: string,
  details: unknown
) => {
  const { error } = await serviceSupabase
    .from("admin_audit_log")
    .update({ details })
    .eq("id", auditId);

  requireAuditSuccess(error);
};
