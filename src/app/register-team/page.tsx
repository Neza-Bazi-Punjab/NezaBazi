import type { Metadata } from "next";
import Link from "next/link";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";
import { escapeIlikePattern } from "@/lib/supabase/query";
import { createClient } from "@/lib/supabase/server";
import { site } from "@/lib/site";
import TeamRegisterForm from "./TeamRegisterForm";

export const metadata: Metadata = {
  title: "Team Registration",
  description: `Team registration for the ${site.title}.`,
};

type RegistrationMetadata = {
  full_name?: string;
  age?: number | string;
  location?: string;
  phone?: string;
  years_experience?: number | string;
  horse_age?: number | string;
  horse_breed?: string;
};

const getMetadataNumber = (value: number | string | undefined) => {
  if (value == null || value === "") {
    return undefined;
  }

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? undefined : numberValue;
};

export default async function RegisterTeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  const isAdmin = profile?.role === "admin";
  const authMetadata = user?.user_metadata as RegistrationMetadata | undefined;

  const { data: existingTeam } = user && !isAdmin
    ? await supabase
        .from("teams")
        .select("id, team_name")
        .eq("leader_profile_id", user.id)
        .maybeSingle()
    : { data: null };

  const { count: teamMemberCount } = existingTeam
    ? await supabase
        .from("team_members")
        .select("id", { count: "exact", head: true })
        .eq("team_id", existingTeam.id)
    : { count: 0 };

  let hasTeamMembership = false;
  let membershipTeamName: string | null = null;

  if (user && !isAdmin && user.email) {
    const serviceSupabase = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data: membership, error: membershipError } = await serviceSupabase
      .from("team_members")
      .select("team_id")
      .ilike("email", escapeIlikePattern(user.email))
      .eq("is_leader", false)
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      console.error("Unable to check the user's existing team membership", membershipError);
    } else if (membership) {
      hasTeamMembership = true;
      const { data: membershipTeam, error: membershipTeamError } = await serviceSupabase
        .from("teams")
        .select("team_name")
        .eq("id", membership.team_id)
        .maybeSingle();

      if (membershipTeamError) {
        console.error("Unable to load the user's existing team", membershipTeamError);
      } else {
        membershipTeamName = membershipTeam?.team_name ?? "your current team";
      }
    }
  }

  const hasCompleteTeam = !isAdmin && Boolean(existingTeam && teamMemberCount === 4);

  return (
    <>
      <PageHeader
        title="Team Registration"
        intro={`Team leaders can register themselves plus 3 teammates, 4 riders total, under one team name for the ${site.title}.`}
      />

      <section className="bg-cream">
        <div className="mx-auto max-w-xl px-6 py-16">
          {user ? (
            hasCompleteTeam || hasTeamMembership ? (
              <>
                <SectionHeading>Team Already Registered</SectionHeading>

                <div className="mt-10 space-y-6">
                  <p className="leading-7 text-brown/85">
                    {hasTeamMembership
                      ? `You are already registered on ${membershipTeamName ?? "your current team"}. A player can only be on one team.`
                      : "You have already registered a team."}
                  </p>
                </div>
              </>
            ) : (
              <>
                <SectionHeading>
                  {existingTeam ? "Complete Team Registration" : "Team Registration"}
                </SectionHeading>
                {existingTeam && (
                  <p className="mt-10 leading-7 text-brown/85">
                    Your team name was saved, but the rider details still need to be submitted.
                  </p>
                )}
                <TeamRegisterForm
                  existingTeamId={existingTeam?.id}
                  initialTeamName={existingTeam?.team_name}
                  leaderProfile={
                    isAdmin
                      ? undefined
                      : {
                          full_name: authMetadata?.full_name,
                          age: getMetadataNumber(authMetadata?.age),
                          location: authMetadata?.location,
                          phone: authMetadata?.phone,
                          email: user.email,
                          years_experience: getMetadataNumber(
                            authMetadata?.years_experience
                          ),
                          horse_age: getMetadataNumber(authMetadata?.horse_age),
                          horse_breed: authMetadata?.horse_breed,
                        }
                  }
                  lockTeamName={!isAdmin && Boolean(existingTeam)}
                  lockLeaderProfileFields={!isAdmin}
                />
              </>
            )
          ) : (
            <>
              <SectionHeading>Login Required</SectionHeading>

              <div className="mt-10 space-y-6">
                <p className="leading-7 text-brown/85">
                  You must be logged in to register for the event.
                </p>

                <Link
                  href="/login?redirect=/register-team"
                  className="block w-full rounded-lg bg-bronze-deep px-6 py-3 text-center font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze"
                >
                  Log In to Register
                </Link>

                <p className="text-center text-sm text-brown/80">
                  New here?{" "}
                  <Link href="/signup" className="font-semibold text-bronze-deep underline">
                    Create an account
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}
