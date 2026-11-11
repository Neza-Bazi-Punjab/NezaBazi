/* One section of the admin dashboard as its own page: Solo riders, Teams,
   Check-in, Staff or Audit log. Each lives at its own address under /admin
   (so refresh and Back stay put) and renders the same AdminDashboard
   component as before, told which section to show.

   The heading draws as soon as the administrator check passes; the rows
   stream in after it (React Suspense), with a muted placeholder table in
   their place meanwhile, so a slow read never holds up the whole page. */
import { Suspense } from "react";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import AdminPageHeading from "./AdminPageHeading";
import AdminTableSkeleton from "./AdminTableSkeleton";
import AdminDashboard, {
  type AdminSection,
  type AuditActor,
  type ArchivedAuditEntry,
  type AuditLogEntry,
  type SoloRegistration,
  type Team,
  type TeamMember,
} from "./AdminDashboard";
import { AdminAccessMessage, getAdminAccess, type AdminAccess } from "./admin-access";
import {
  loadAuthUserIndex,
  matchSoloHeadshots,
  matchTeamHeadshots,
  countSoloRowsByProfile,
  type SoloTwin,
  type TeamTwin,
  type SoloHeadshot,
} from "@/lib/admin/headshot-urls";

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

  /* Check-in and Staff read nothing here (they fetch through their own
     routes), so there is nothing to wait for and no placeholder to flash. */
  const readsRows = tab === "solo" || tab === "team" || tab === "audit";
  const data = (
    <AdminSectionData tab={tab} supabase={access.supabase} currentAdminId={access.userId} />
  );

  return (
    <>
      <AdminPageHeading title={title} intro={intro} />

      <section className="bg-cream">
        <div className="px-6 pb-12 pt-4 sm:pb-16 sm:pt-6">
          {readsRows ? (
            <Suspense fallback={<AdminTableSkeleton tab={tab} />}>{data}</Suspense>
          ) : (
            data
          )}
        </div>
      </section>
    </>
  );
}

/* The section's rows: every database read the page makes, then the dashboard
   drawn with them. It is its own async component so it can stream in under
   the heading instead of holding the whole page until the last read lands. */
async function AdminSectionData({
  tab,
  supabase,
  currentAdminId,
}: {
  tab: AdminSection;
  supabase: Extract<AdminAccess, { kind: "admin" }>["supabase"];
  currentAdminId: string;
}) {

  /* Each page loads only what it shows. Check-in and Staff fetch their own
     data through their own routes, so they need none of this. Every load is
     fresh from the database on each visit and after each save, as before. */
  const needs = {
    solo: tab === "solo",
    teams: tab === "team",
    audit: tab === "audit",
  };
  const none = Promise.resolve({ data: [] as unknown[] });

  /* The account listing (up to 1000 users, from the Auth server) does not
     depend on the rows, so it starts now, alongside the database reads,
     instead of waiting for them. Only after the administrator check above,
     and only on the pages that use it. Neither load ever rejects: a failure
     only means no thumbnails or no actor names. */
  const photoService = needs.solo || needs.teams ? createServiceRoleClient() : null;
  const authUserIndexLoad = photoService ? loadAuthUserIndex(photoService) : null;
  /* Team riders' photos may come from their own solo entry (same code; a
     team formed on Form teams is a copy of it) or an account behind a solo
     entry under their email; the Teams page does not otherwise read solo
     entries. */
  const soloContactsLoad =
    needs.teams && photoService
      ? photoService
          .from("solo_registrations")
          .select("id, email, profile_id, full_name, headshot_path, confirmation_code")
      : null;
  /* And the other way: a photo taken on a rider's team place shows on their
     solo entry when it has none. */
  const teamPhotosLoad =
    needs.solo && photoService
      ? photoService
          .from("team_members")
          .select("id, confirmation_code, headshot_path")
          .not("headshot_path", "is", null)
      : null;

  // The account list only puts names to the audit log's actors. A thrown
  // failure is caught like a returned one, so starting it early can never
  // leave an unhandled rejection behind.
  const auditActorsLoad = (async (): Promise<AuditActor[]> => {
    if (needs.audit) {
      const { data: usersData, error: usersError } =
        await createServiceRoleClient().auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });

      if (usersError) {
        console.error("Unable to load admin audit actor lookup", usersError);
      }

      return (
        usersData?.users.map((authUser) => ({
          id: authUser.id,
          email: authUser.email ?? "",
          full_name: getMetadataString(authUser.user_metadata, "full_name"),
          phone: getMetadataString(authUser.user_metadata, "phone"),
        })) ?? []
      );
    }

    return [];
  })().catch((error: unknown): AuditActor[] => {
    console.error("Unable to load admin audit actor lookup", error);
    return [];
  });

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

  /* Thumbnails for the Photo column. Admins read every headshot, but the
     signing goes through the service role like every other staff screen. */
  let soloHeadshots: Record<string, SoloHeadshot> = {};
  let teamHeadshots: Record<string, SoloHeadshot> = {};

  if (needs.solo && photoService && authUserIndexLoad) {
    const teamPhotos = teamPhotosLoad ? await teamPhotosLoad : null;
    const teamTwinByCode = new Map<string, TeamTwin>();

    for (const row of (teamPhotos?.data ?? []) as Array<TeamTwin & { confirmation_code: string | null }>) {
      if (row.confirmation_code && !teamTwinByCode.has(row.confirmation_code)) {
        teamTwinByCode.set(row.confirmation_code, row);
      }
    }

    soloHeadshots = await matchSoloHeadshots(
      await authUserIndexLoad,
      (soloRegistrations ?? []) as SoloRegistration[],
      photoService,
      teamTwinByCode
    );
  }

  /* The same for the Teams list: each rider's own photo on the row first,
     then the account rule (matchTeamHeadshots). */
  if (needs.teams && photoService && authUserIndexLoad && soloContactsLoad) {
    const [index, soloContacts] = await Promise.all([authUserIndexLoad, soloContactsLoad]);
    const soloRows = (soloContacts.data ?? []) as Array<SoloTwin & { confirmation_code: string | null }>;
    const soloProfileByEmail = new Map<string, string>();
    const soloTwinByCode = new Map<string, SoloTwin>();

    for (const row of soloRows) {
      const address = row.email?.trim().toLowerCase();

      if (address && row.profile_id && !soloProfileByEmail.has(address)) {
        soloProfileByEmail.set(address, row.profile_id);
      }

      if (row.confirmation_code && !soloTwinByCode.has(row.confirmation_code)) {
        soloTwinByCode.set(row.confirmation_code, row);
      }
    }

    teamHeadshots = await matchTeamHeadshots(
      index,
      (teamMembers ?? []) as TeamMember[],
      new Map(((teams ?? []) as Team[]).map((team) => [team.id, team.leader_profile_id ?? null])),
      soloProfileByEmail,
      photoService,
      soloTwinByCode,
      countSoloRowsByProfile(soloRows)
    );
  }

  const auditActors = await auditActorsLoad;

  return (
    <AdminDashboard
      tab={tab}
      currentAdminId={currentAdminId}
      soloRegistrations={(soloRegistrations ?? []) as SoloRegistration[]}
      teams={(teams ?? []) as Team[]}
      teamMembers={(teamMembers ?? []) as TeamMember[]}
      auditLog={(auditLog ?? []) as AuditLogEntry[]}
      auditArchive={(auditArchive ?? []) as ArchivedAuditEntry[]}
      auditActors={auditActors}
      soloHeadshots={soloHeadshots}
      teamHeadshots={teamHeadshots}
    />
  );
}
