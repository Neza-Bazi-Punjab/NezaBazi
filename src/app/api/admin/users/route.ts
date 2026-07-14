import { NextResponse } from "next/server";
import {
  createServiceRoleClient,
  insertRequiredAuditLog,
  updateRequiredAuditLog,
  verifyAdminRequest,
} from "@/lib/admin/server";
import { escapeIlikePattern } from "@/lib/supabase/query";

type ProfileRow = {
  id: string;
  role: string | null;
};

type UpdateRoleRequest = {
  userId?: string;
  newRole?: "admin" | "player";
  email?: string;
  linkedRegistrationUpdates?: Array<{
    type?: "solo" | "team_member";
    id?: string;
  }>;
};

type DeleteUserRequest = {
  userId?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
      return NextResponse.json({ error: soloError.message }, { status: 400 });
    }

    if (teamsError) {
      return NextResponse.json({ error: teamsError.message }, { status: 400 });
    }

    if (riderError) {
      return NextResponse.json({ error: riderError.message }, { status: 400 });
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
      return NextResponse.json({ error: teamMembersError.message }, { status: 400 });
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
        return NextResponse.json({ error: riderTeamsError.message }, { status: 400 });
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
    return NextResponse.json({ error: profilesError.message }, { status: 400 });
  }

  const profilesById = new Map(
    ((profiles ?? []) as ProfileRow[]).map((profile) => [profile.id, profile])
  );

  const users = usersData.users.map((user) => {
    const profile = profilesById.get(user.id);

    return {
      id: user.id,
      email: user.email ?? "",
      created_at: user.created_at,
      role: profile?.role === "admin" ? "admin" : "player",
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

  const body = (await request.json()) as UpdateRoleRequest;
  const { userId, newRole } = body;
  const email = body.email?.trim();

  if (!userId || (!newRole && !email)) {
    return NextResponse.json(
      { error: "Please provide a user id and at least one update." },
      { status: 400 }
    );
  }

  if (newRole && newRole !== "admin" && newRole !== "player") {
    return NextResponse.json({ error: "Please provide a valid role." }, { status: 400 });
  }

  if (email !== undefined && !emailPattern.test(email)) {
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
    return NextResponse.json({ error: targetProfileError.message }, { status: 400 });
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

  if (targetProfile.role === "admin" && newRole === "player") {
    const { count, error: adminCountError } = await serviceSupabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

    if (adminCountError) {
      return NextResponse.json({ error: adminCountError.message }, { status: 400 });
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

    for (const update of body.linkedRegistrationUpdates ?? []) {
      if (!update.id || !update.type) {
        continue;
      }

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
        linked_registration_updates: body.linkedRegistrationUpdates ?? [],
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
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const adminCheck = await verifyAdminRequest();

  if (!adminCheck.ok) {
    return adminCheck.response;
  }

  const body = (await request.json()) as DeleteUserRequest;
  const { userId } = body;

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
    return NextResponse.json({ error: targetProfileError.message }, { status: 400 });
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
      return NextResponse.json({ error: adminCountError.message }, { status: 400 });
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
    return NextResponse.json({ error: deleteProfileError.message }, { status: 400 });
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
