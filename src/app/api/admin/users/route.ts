import { NextResponse } from "next/server";
import {
  createServiceRoleClient,
  insertRequiredAuditLog,
  updateRequiredAuditLog,
  verifyAdminRequest,
} from "@/lib/admin/server";
import { isValidEmail } from "@/lib/email-address";
import { isProfileRole, type ProfileRole } from "@/lib/scoring/types";
import { escapeIlikePattern } from "@/lib/supabase/query";

export const dynamic = "force-dynamic";

/* A database read or write failed. The detail goes to the server log; the
   administrator gets a sentence, not Postgres text. Auth API errors (from
   supabase.auth.admin) are human-readable and are still passed through. */
const databaseErrorResponse = (error: { code?: string; message?: string }) => {
  console.error("Admin users route database error", { code: error.code, message: error.message });
  return NextResponse.json(
    { error: "The database could not complete this request. Try again." },
    { status: 500 }
  );
};

type ProfileRow = {
  id: string;
  role: string | null;
};

type LinkedRegistrationUpdate = {
  type: "solo" | "team_member";
  id: string;
};

type UpdateRoleRequest = {
  userId: string;
  /* player, judge, commentator or admin. admin_set_profile_role is the only
     write path for a role, and it audits the change in the same transaction. */
  newRole?: ProfileRole;
  email?: string;
  linkedRegistrationUpdates: LinkedRegistrationUpdate[];
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isUserId = (value: unknown): value is string =>
  typeof value === "string" && uuidPattern.test(value);

const parseLinkedRegistrationUpdate = (
  value: unknown
): LinkedRegistrationUpdate | null => {
  if (!isRecord(value)) {
    return null;
  }

  const { type, id } = value;

  if ((type !== "solo" && type !== "team_member") || !isUserId(id)) {
    return null;
  }

  return { type, id };
};

/* Null when the body is not a well-formed update. Field-level problems that
   deserve their own message (no update at all, a bad email) are reported by
   the handler. */
const parseUpdateRequest = (value: unknown): UpdateRoleRequest | null => {
  if (!isRecord(value)) {
    return null;
  }

  const { userId, newRole, email } = value;

  if (
    !isUserId(userId) ||
    (newRole !== undefined && !isProfileRole(newRole)) ||
    (email !== undefined && typeof email !== "string")
  ) {
    return null;
  }

  const rawUpdates = value.linkedRegistrationUpdates ?? [];

  if (!Array.isArray(rawUpdates) || rawUpdates.length > 20) {
    return null;
  }

  const linkedRegistrationUpdates: LinkedRegistrationUpdate[] = [];

  for (const rawUpdate of rawUpdates) {
    const update = parseLinkedRegistrationUpdate(rawUpdate);

    if (!update) {
      return null;
    }

    linkedRegistrationUpdates.push(update);
  }

  return {
    userId,
    newRole: isProfileRole(newRole) ? newRole : undefined,
    email: typeof email === "string" ? email : undefined,
    linkedRegistrationUpdates,
  };
};


const getMetadataString = (metadata: object | null | undefined, key: string) => {
  if (!metadata || !(key in metadata)) {
    return "";
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
};

const getUserSubjectName = (
  user:
    | {
        email?: string | null;
        user_metadata?: object | null;
      }
    | null
    | undefined
) => {
  if (!user) {
    return null;
  }

  return getMetadataString(user.user_metadata, "full_name") || user.email || null;
};

const getErrorText = (error: unknown) => {
  if (!error) {
    return "";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "");
  }

  return "";
};

const getAuthEmailErrorMessage = (error: unknown) => {
  const message = getErrorText(error);
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("already") ||
    normalizedMessage.includes("exists") ||
    normalizedMessage.includes("duplicate") ||
    normalizedMessage.includes("conflict") ||
    normalizedMessage.includes("registered")
  ) {
    return "This email is already in use by another account.";
  }

  return message && message !== "{}" ? message : "Unable to update this email.";
};

const getRegistrationEmailErrorMessage = (error: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}) => {
  const errorText = [
    error.code,
    error.message,
    error.details,
    error.hint,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    error.code === "23505" ||
    errorText.includes("duplicate") ||
    errorText.includes("unique") ||
    errorText.includes("already")
  ) {
    return "this email is already registered elsewhere.";
  }

  return error.message ?? "unable to update this registration email.";
};

export async function GET(request: Request) {
  const adminCheck = await verifyAdminRequest();

  if (!adminCheck.ok) {
    return adminCheck.response;
  }

  const serviceSupabase = createServiceRoleClient();
  const linkedUserId = new URL(request.url).searchParams.get("linkedUserId");

  if (linkedUserId) {
    // Rider rows on other leaders' teams are linked to this account only by
    // email, so look up the user's current login email first.
    const { data: targetUserData, error: targetUserError } =
      await serviceSupabase.auth.admin.getUserById(linkedUserId);

    if (targetUserError) {
      return NextResponse.json({ error: targetUserError.message }, { status: 400 });
    }

    const targetEmail = targetUserData.user?.email ?? "";

    const [
      { data: soloRegistrations, error: soloError },
      { data: leaderTeams, error: teamsError },
      { data: riderRows, error: riderError },
    ] = await Promise.all([
      serviceSupabase
        .from("solo_registrations")
        .select("id, email")
        .eq("profile_id", linkedUserId),
      serviceSupabase
        .from("teams")
        .select("id, team_name")
        .eq("leader_profile_id", linkedUserId),
      targetEmail !== ""
        ? serviceSupabase
            .from("team_members")
            .select("id, email, team_id")
            .ilike("email", escapeIlikePattern(targetEmail))
            .eq("is_leader", false)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (soloError) {
      return databaseErrorResponse(soloError);
    }

    if (teamsError) {
      return databaseErrorResponse(teamsError);
    }

    if (riderError) {
      return databaseErrorResponse(riderError);
    }

    const teamsById = new Map(
      ((leaderTeams ?? []) as Array<{ id: string; team_name: string }>).map((team) => [
        team.id,
        team.team_name,
      ])
    );
    const teamIds = Array.from(teamsById.keys());
    const { data: teamMembers, error: teamMembersError } = teamIds.length
      ? await serviceSupabase
          .from("team_members")
          .select("id, email, team_id")
          .in("team_id", teamIds)
          .eq("is_leader", true)
      : { data: [], error: null };

    if (teamMembersError) {
      return databaseErrorResponse(teamMembersError);
    }

    // Team names for rider rows on teams this user doesn't lead.
    const riderMembers = (riderRows ?? []) as Array<{
      id: string;
      email: string;
      team_id: string;
    }>;
    const missingTeamIds = riderMembers
      .map((member) => member.team_id)
      .filter((id) => !teamsById.has(id));

    if (missingTeamIds.length > 0) {
      const { data: riderTeams, error: riderTeamsError } = await serviceSupabase
        .from("teams")
        .select("id, team_name")
        .in("id", missingTeamIds);

      if (riderTeamsError) {
        return databaseErrorResponse(riderTeamsError);
      }

      for (const team of (riderTeams ?? []) as Array<{ id: string; team_name: string }>) {
        teamsById.set(team.id, team.team_name);
      }
    }

    return NextResponse.json({
      registrations: [
        ...((soloRegistrations ?? []) as Array<{ id: string; email: string }>).map(
          (registration) => ({
            id: registration.id,
            type: "solo" as const,
            label: "Solo registration",
            email: registration.email,
          })
        ),
        ...((teamMembers ?? []) as Array<{
          id: string;
          email: string;
          team_id: string;
        }>).map((member) => ({
          id: member.id,
          type: "team_member" as const,
          label: `Team leader entry on ${teamsById.get(member.team_id) ?? "team"}`,
          email: member.email,
          teamName: teamsById.get(member.team_id) ?? null,
        })),
        ...riderMembers.map((member) => ({
          id: member.id,
          type: "team_member" as const,
          label: `Rider on ${teamsById.get(member.team_id) ?? "team"} (added by its team leader)`,
          email: member.email,
          teamName: teamsById.get(member.team_id) ?? null,
        })),
      ],
    });
  }

  const { data: usersData, error: usersError } =
    await serviceSupabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 400 });
  }

  const { data: profiles, error: profilesError } = await serviceSupabase
    .from("profiles")
    .select("id, role");

  if (profilesError) {
    return databaseErrorResponse(profilesError);
  }

  const profilesById = new Map(
    ((profiles ?? []) as ProfileRow[]).map((profile) => [profile.id, profile])
  );

  const users = usersData.users.map((user) => {
    const storedRole = profilesById.get(user.id)?.role;
    // Every role is reported as stored; anything unrecognised reads as the
    // least privileged one rather than leaking an unknown value to the UI.
    const role: ProfileRole = isProfileRole(storedRole) ? storedRole : "player";

    return {
      id: user.id,
      email: user.email ?? "",
      created_at: user.created_at,
      role,
      full_name: getMetadataString(user.user_metadata, "full_name"),
      phone: getMetadataString(user.user_metadata, "phone"),
    };
  });

  return NextResponse.json(users);
}

export async function PATCH(request: Request) {
  const adminCheck = await verifyAdminRequest();

  if (!adminCheck.ok) {
    return adminCheck.response;
  }

  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (
    isRecord(rawBody) &&
    rawBody.newRole !== undefined &&
    !isProfileRole(rawBody.newRole)
  ) {
    return NextResponse.json({ error: "Please provide a valid role." }, { status: 400 });
  }

  const body = parseUpdateRequest(rawBody);

  if (!body) {
    return NextResponse.json(
      { error: "Please provide a user id and at least one update." },
      { status: 400 }
    );
  }

  const { userId, newRole } = body;
  const email = body.email?.trim();

  if (!newRole && !email) {
    return NextResponse.json(
      { error: "Please provide a user id and at least one update." },
      { status: 400 }
    );
  }

  if (email !== undefined && !isValidEmail(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 }
    );
  }

  const serviceSupabase = createServiceRoleClient();
  const { data: targetProfile, error: targetProfileError } = await serviceSupabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (targetProfileError) {
    return databaseErrorResponse(targetProfileError);
  }

  if (!targetProfile) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }

  const { data: targetUserData, error: targetUserError } =
    await serviceSupabase.auth.admin.getUserById(userId);

  if (targetUserError) {
    console.error("Supabase admin user lookup error before update", targetUserError);
  }

  const targetSubjectName = getUserSubjectName(targetUserData?.user);

  // Any role other than admin is a demotion for an administrator: judges and
  // commentators cannot reach the dashboard, so the last admin keeps it.
  if (targetProfile.role === "admin" && newRole !== undefined && newRole !== "admin") {
    const { count, error: adminCountError } = await serviceSupabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

    if (adminCountError) {
      return databaseErrorResponse(adminCountError);
    }

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "Cannot demote the last remaining admin." },
        { status: 400 }
      );
    }
  }

  if (email !== undefined) {
    const { data: usersData, error: usersError } =
      await serviceSupabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase();
    const duplicateUser = usersData.users.find(
      (user) => user.id !== userId && user.email?.toLowerCase() === normalizedEmail
    );
    const targetUser = usersData.users.find((user) => user.id === userId);
    const oldEmail = targetUserData?.user?.email ?? targetUser?.email ?? null;

    if (duplicateUser) {
      return NextResponse.json(
        { error: "This email is already in use by another account." },
        { status: 400 }
      );
    }

    let emailAuditId: string;

    try {
      emailAuditId = await insertRequiredAuditLog(
        serviceSupabase,
        adminCheck.actor,
        {
          action: "edit_user_email",
          target_table: "profiles",
          target_id: userId,
          details: {
            status: "started",
            subject_name: targetSubjectName ?? oldEmail ?? email,
            old_email: oldEmail,
            new_email: email,
          },
        }
      );
    } catch {
      return NextResponse.json(
        { error: "The account was not changed because its audit record could not be created." },
        { status: 500 }
      );
    }

    const { error: emailUpdateError } =
      await serviceSupabase.auth.admin.updateUserById(userId, { email });

    if (emailUpdateError) {
      console.error("Supabase admin email update error", emailUpdateError);

      try {
        await updateRequiredAuditLog(serviceSupabase, emailAuditId, {
          status: "failed",
          subject_name: targetSubjectName ?? oldEmail ?? email,
          old_email: oldEmail,
          new_email: email,
          error: getAuthEmailErrorMessage(emailUpdateError),
        });
      } catch (auditError) {
        console.error("Unable to mark failed email audit record", auditError);
      }

      return NextResponse.json(
        { error: getAuthEmailErrorMessage(emailUpdateError) },
        { status: 400 }
      );
    }

    const registrationWarnings: string[] = [];

    for (const update of body.linkedRegistrationUpdates) {
      const { error: registrationError } =
        update.type === "solo"
          ? await serviceSupabase
              .from("solo_registrations")
              .update({ email })
              .eq("id", update.id)
          : await serviceSupabase
              .from("team_members")
              .update({ email })
              .eq("id", update.id);

      if (registrationError) {
        registrationWarnings.push(
          `Failed to update ${
            update.type === "solo" ? "solo registration" : "team member"
          } email: ${getRegistrationEmailErrorMessage(registrationError)}`
        );
      }
    }

    try {
      await updateRequiredAuditLog(serviceSupabase, emailAuditId, {
        status: "completed",
        subject_name: targetSubjectName ?? oldEmail ?? email,
        old_email: oldEmail,
        new_email: email,
        linked_registration_updates: body.linkedRegistrationUpdates,
        warnings: registrationWarnings,
      });
    } catch {
      return NextResponse.json(
        {
          error:
            "The email was changed and an audit record exists, but its completion status could not be saved.",
        },
        { status: 500 }
      );
    }

    if (registrationWarnings.length > 0 && !newRole) {
      return NextResponse.json({ ok: true, warnings: registrationWarnings });
    }
  }

  if (newRole) {
    const { error: updateError } = await serviceSupabase.rpc(
      "admin_set_profile_role",
      {
        p_profile_id: userId,
        p_new_role: newRole,
        p_subject_name: targetSubjectName,
        p_actor_id: adminCheck.actor.id,
        p_actor_name: adminCheck.actor.name,
        p_actor_email: adminCheck.actor.email,
      }
    );

    if (updateError) {
      if (updateError.code === "P0002") {
        return NextResponse.json({ error: "Profile not found." }, { status: 404 });
      }

      // Before 20261025110000_staff_roles.sql is applied, the database
      // function still knows only player and admin.
      if (updateError.code === "22023" || updateError.code === "23514") {
        return NextResponse.json(
          {
            error:
              newRole === "judge" || newRole === "commentator"
                ? "The judge and commentator roles are not set up in the database yet (apply 20261025110000_staff_roles.sql)."
                : "That role is not allowed.",
          },
          { status: 400 }
        );
      }

      return databaseErrorResponse(updateError);
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const adminCheck = await verifyAdminRequest();

  if (!adminCheck.ok) {
    return adminCheck.response;
  }

  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const requestedUserId = isRecord(rawBody) ? rawBody.userId : null;
  const userId = isUserId(requestedUserId) ? requestedUserId : null;

  if (!userId) {
    return NextResponse.json({ error: "Please provide a user id." }, { status: 400 });
  }

  const serviceSupabase = createServiceRoleClient();
  const { data: targetProfile, error: targetProfileError } = await serviceSupabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (targetProfileError) {
    return databaseErrorResponse(targetProfileError);
  }

  if (!targetProfile) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }

  if (targetProfile.role === "admin") {
    const { count, error: adminCountError } = await serviceSupabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

    if (adminCountError) {
      return databaseErrorResponse(adminCountError);
    }

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the last remaining admin." },
        { status: 400 }
      );
    }
  }

  const { data: targetUserData, error: targetUserError } =
    await serviceSupabase.auth.admin.getUserById(userId);

  if (targetUserError) {
    console.error("Supabase admin user lookup error before delete", targetUserError);
  }

  const deletedSubjectName = getUserSubjectName(targetUserData?.user);
  const deleteAuditDetails = {
    subject_name: deletedSubjectName,
    email: targetUserData?.user?.email ?? null,
    role: targetProfile.role,
  };
  let deleteAuditId: string;

  try {
    deleteAuditId = await insertRequiredAuditLog(
      serviceSupabase,
      adminCheck.actor,
      {
        action: "delete_user",
        target_table: "profiles",
        target_id: userId,
        details: {
          status: "started",
          ...deleteAuditDetails,
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "The user was not deleted because the audit record could not be created." },
      { status: 500 }
    );
  }

  const { error: deleteUserError } = await serviceSupabase.auth.admin.deleteUser(userId);

  if (deleteUserError) {
    try {
      await updateRequiredAuditLog(serviceSupabase, deleteAuditId, {
        status: "failed",
        ...deleteAuditDetails,
        error: deleteUserError.message,
      });
    } catch (auditError) {
      console.error("Unable to mark failed user-deletion audit record", auditError);
    }

    return NextResponse.json({ error: deleteUserError.message }, { status: 400 });
  }

  const { error: deleteProfileError } = await serviceSupabase
    .from("profiles")
    .delete()
    .eq("id", userId);

  if (deleteProfileError) {
    return databaseErrorResponse(deleteProfileError);
  }

  try {
    await updateRequiredAuditLog(serviceSupabase, deleteAuditId, {
      status: "completed",
      ...deleteAuditDetails,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "The user was deleted and an audit record exists, but its completion status could not be saved.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
