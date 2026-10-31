/* One section of the admin dashboard as its own page: Solo riders, Teams,
   Check-in, Staff or Audit log. Each lives at its own address under /admin
   (so refresh and Back stay put) and renders the same AdminDashboard
   component as before, told which section to show. */
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import AdminPageHeading from "./AdminPageHeading";
import AdminDashboard, {
  type AdminSection,
  type AuditActor,
  type ArchivedAuditEntry,
  type AuditLogEntry,
  type SoloRegistration,
  type Team,
  type TeamMember,
} from "./AdminDashboard";
import { AdminAccessMessage, getAdminAccess } from "./admin-access";

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

export default async function AdminDashboardSection({
  tab,
  title,
  intro,
  path,
}: {
  tab: AdminSection;
  title: string;
  intro: string;
  /* This page's own address, for the login redirect. */
  path: string;
}) {
  const access = await getAdminAccess();

  if (access.kind !== "admin") {
    return <AdminAccessMessage title={title} kind={access.kind} redirect={path} />;
  }

  const { supabase } = access;

  /* Each page loads only what it shows. Check-in and Staff fetch their own
     data through their own routes, so they need none of this. Every load is
     fresh from the database on each visit and after each save, as before. */
  const needs = {
    solo: tab === "solo",
    teams: tab === "team",
    audit: tab === "audit",
  };
  const none = Promise.resolve({ data: [] as unknown[] });

  const [
    { data: soloRegistrations },
    { data: teams },
    { data: teamMembers },
    { data: auditLog },
    { data: auditArchive },
  ] = await Promise.all([
    needs.solo
      ? supabase.from("solo_registrations").select("*").order("created_at", { ascending: false })
      : none,
    needs.teams
      ? supabase.from("teams").select("*").order("created_at", { ascending: false })
      : none,
    needs.teams ? supabase.from("team_members").select("*") : none,
    needs.audit
      ? supabase
          .from("admin_audit_log")
          .select("*, actor:profiles!actor_id(id)")
          .order("created_at", { ascending: false })
          .limit(200)
      : none,
    needs.audit
      ? supabase
          .from("admin_audit_log_archive")
          .select("*")
          .order("deleted_at", { ascending: false })
          .limit(500)
      : none,
  ]);

  // The account list only puts names to the audit log's actors.
  let auditActors: AuditActor[] = [];

  if (needs.audit) {
    const { data: usersData, error: usersError } =
      await createServiceRoleClient().auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

    if (usersError) {
      console.error("Unable to load admin audit actor lookup", usersError);
    }

    auditActors =
      usersData?.users.map((authUser) => ({
        id: authUser.id,
        email: authUser.email ?? "",
        full_name: getMetadataString(authUser.user_metadata, "full_name"),
        phone: getMetadataString(authUser.user_metadata, "phone"),
      })) ?? [];
  }

  return (
    <>
      <AdminPageHeading title={title} intro={intro} />

      <section className="bg-cream">
        <div className="px-6 pb-12 pt-4 sm:pb-16 sm:pt-6">
          <AdminDashboard
            tab={tab}
            currentAdminId={access.userId}
            soloRegistrations={(soloRegistrations ?? []) as SoloRegistration[]}
            teams={(teams ?? []) as Team[]}
            teamMembers={(teamMembers ?? []) as TeamMember[]}
            auditLog={(auditLog ?? []) as AuditLogEntry[]}
            auditArchive={(auditArchive ?? []) as ArchivedAuditEntry[]}
            auditActors={auditActors}
          />
        </div>
      </section>
    </>
  );
}
