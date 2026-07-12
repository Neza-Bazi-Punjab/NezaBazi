import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

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

const verifyAdminRequest = async () => {
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

  return { ok: true as const };
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

export async function GET(request: Request) {
  const adminCheck = await verifyAdminRequest();

  if (!adminCheck.ok) {
    return adminCheck.response;
  }

  const serviceSupabase = createServiceRoleClient();
  const linkedUserId = new URL(request.url).searchParams.get("linkedUserId");

  if (linkedUserId) {
    const [
      { data: soloRegistrations, error: soloError },
      { data: leaderTeams, error: teamsError },
    ] = await Promise.all([
      serviceSupabase
        .from("solo_registrations")
        .select("id, email")
        .eq("profile_id", linkedUserId),
      serviceSupabase
        .from("teams")
        .select("id, team_name")
        .eq("leader_profile_id", linkedUserId),
    ]);

    if (soloError) {
      return NextResponse.json({ error: soloError.message }, { status: 400 });
    }

    if (teamsError) {
      return NextResponse.json({ error: teamsError.message }, { status: 400 });
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
          label: `Team member on ${teamsById.get(member.team_id) ?? "team"}`,
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

    if (duplicateUser) {
      return NextResponse.json(
        { error: "This email is already in use by another account." },
        { status: 400 }
      );
    }

    const { error: emailUpdateError } =
      await serviceSupabase.auth.admin.updateUserById(userId, { email });

    if (emailUpdateError) {
      console.error("Supabase admin email update error", emailUpdateError);

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

    if (registrationWarnings.length > 0 && !newRole) {
      return NextResponse.json({ ok: true, warnings: registrationWarnings });
    }
  }

  if (newRole) {
    const { error: updateError } = await serviceSupabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", userId);

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

  const { error: deleteUserError } = await serviceSupabase.auth.admin.deleteUser(userId);

  if (deleteUserError) {
    return NextResponse.json({ error: deleteUserError.message }, { status: 400 });
  }

  const { error: deleteProfileError } = await serviceSupabase
    .from("profiles")
    .delete()
    .eq("id", userId);

  if (deleteProfileError) {
    return NextResponse.json({ error: deleteProfileError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
