import type { Metadata } from "next";
import Link from "next/link";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";
import { createClient } from "@/lib/supabase/server";
import { site } from "@/lib/site";
import AdminDashboard, {
  type AuditActor,
  type ArchivedAuditEntry,
  type AuditLogEntry,
  type SoloRegistration,
  type Team,
  type TeamMember,
} from "./AdminDashboard";

export const metadata: Metadata = {
  title: "Admin Dashboard",
  description: `Admin dashboard for the ${site.title}.`,
};

const getMetadataString = (metadata: object | null | undefined, key: string) => {
  if (!metadata || !(key in metadata)) {
    return "";
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
};

const createServiceRoleClient = () =>
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

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <>
        <PageHeader
          title="Admin Dashboard"
          intro="This page requires an administrator login."
        />

        <section className="bg-cream">
          <div className="mx-auto max-w-xl px-6 py-16">
            <SectionHeading>Login Required</SectionHeading>

            <div className="mt-10 space-y-6">
              <p className="leading-7 text-brown/85">
                You must be logged in as an administrator to view this page.
              </p>

              <Link
                href="/login?redirect=/admin"
                className="block w-full rounded-lg bg-bronze-deep px-6 py-3 text-center font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze"
              >
                Log In
              </Link>
            </div>
          </div>
        </section>
      </>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") {
    return (
      <>
        <PageHeader
          title="Admin Dashboard"
          intro="Registration data is available to administrators only."
        />

        <section className="bg-cream">
          <div className="mx-auto max-w-xl px-6 py-16">
            <SectionHeading>Access Denied</SectionHeading>

            <div className="mt-10 space-y-6">
              <p className="leading-7 text-brown/85">
                Access denied — this page is for administrators only.
              </p>

              <Link
                href="/"
                className="block w-full rounded-lg bg-bronze-deep px-6 py-3 text-center font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </section>
      </>
    );
  }

  const [
    { data: soloRegistrations },
    { data: teams },
    { data: teamMembers },
    { data: auditLog },
    { data: auditArchive },
  ] = await Promise.all([
    supabase
      .from("solo_registrations")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase.from("teams").select("*").order("created_at", { ascending: false }),
    supabase.from("team_members").select("*"),
    supabase
      .from("admin_audit_log")
      .select("*, actor:profiles!actor_id(id)")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("admin_audit_log_archive")
      .select("*")
      .order("deleted_at", { ascending: false })
      .limit(500),
  ]);
  const serviceSupabase = createServiceRoleClient();
  const { data: usersData, error: usersError } =
    await serviceSupabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

  if (usersError) {
    console.error("Unable to load admin audit actor lookup", usersError);
  }

  const auditActors =
    usersData?.users.map((authUser) => ({
      id: authUser.id,
      email: authUser.email ?? "",
      full_name: getMetadataString(authUser.user_metadata, "full_name"),
      phone: getMetadataString(authUser.user_metadata, "phone"),
    })) ?? [];

  return (
    <>
      <PageHeader
        title="Admin Dashboard"
        intro={`Review solo and team registrations for the ${site.title}.`}
      />

      <section className="bg-cream">
        <div className="mx-auto max-w-[1500px] px-6 py-16">
          <AdminDashboard
            currentAdminId={user.id}
            soloRegistrations={(soloRegistrations ?? []) as SoloRegistration[]}
            teams={(teams ?? []) as Team[]}
            teamMembers={(teamMembers ?? []) as TeamMember[]}
            auditLog={(auditLog ?? []) as AuditLogEntry[]}
            auditArchive={(auditArchive ?? []) as ArchivedAuditEntry[]}
            auditActors={auditActors as AuditActor[]}
          />
        </div>
      </section>
    </>
  );
}
