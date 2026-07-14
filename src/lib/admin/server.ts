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

export const verifyAdminRequest = async () => {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    };
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
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

  const fullName = getMetadataString(user.user_metadata, "full_name").trim();
  const actor: VerifiedAuditActor = {
    id: user.id,
    name: fullName || user.email || null,
    email: user.email ?? null,
  };

  return { ok: true as const, actor };
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
