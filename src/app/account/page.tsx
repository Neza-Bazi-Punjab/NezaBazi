import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";
import { createClient } from "@/lib/supabase/server";
import { site } from "@/lib/site";
import AccountPageClient, {
  type AccountProfile,
  type AccountSoloRegistration,
  type AccountTeam,
  type AccountTeamMember,
} from "./AccountPage";

export const metadata: Metadata = {
  title: "My Account",
  description: `Manage your account for the ${site.title}.`,
};

type AccountMetadata = {
  full_name?: string;
  age?: number | string;
  location?: string;
  phone?: string;
};

const getMetadataNumber = (value: number | string | undefined) => {
  if (value == null || value === "") {
    return null;
  }

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? null : numberValue;
};

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <>
        <PageHeader
          title="My Account"
          intro="Log in to manage your profile and view your active registrations."
        />

        <section className="bg-cream">
          <div className="mx-auto max-w-xl px-6 py-16">
            <SectionHeading>Login Required</SectionHeading>

            <div className="mt-10 space-y-6">
              <p className="leading-7 text-brown/85">
                You must be logged in to view your account.
              </p>

              <Link
                href="/login?redirect=/account"
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

  const authMetadata = user.user_metadata as AccountMetadata;

  const [{ data: soloRegistration }, { data: team }] = await Promise.all([
    supabase
      .from("solo_registrations")
      .select(
        "id, full_name, age, location, phone, email, years_experience, horse_age, horse_breed, created_at"
      )
      .eq("profile_id", user.id)
      .maybeSingle(),
    supabase
      .from("teams")
      .select("id, team_name, created_at")
      .eq("leader_profile_id", user.id)
      .maybeSingle(),
  ]);

  const { data: teamMembers } = team
    ? await supabase
        .from("team_members")
        .select(
          "id, team_id, full_name, age, location, phone, email, years_experience, horse_age, horse_breed, is_leader, created_at"
        )
        .eq("team_id", team.id)
    : { data: null };

  return (
    <>
      <PageHeader
        title="My Account"
        intro="Manage your profile information and review your active registrations."
      />

      <section className="bg-cream">
        <div className="mx-auto max-w-4xl px-6 py-16">
          <AccountPageClient
            profile={
              {
                id: user.id,
                full_name: authMetadata.full_name ?? "",
                age: getMetadataNumber(authMetadata.age),
                location: authMetadata.location ?? "",
                phone: authMetadata.phone ?? "",
                email: user.email ?? "",
              } as AccountProfile
            }
            soloRegistration={
              (soloRegistration ?? null) as AccountSoloRegistration | null
            }
            team={(team ?? null) as AccountTeam | null}
            teamMembers={(teamMembers ?? []) as AccountTeamMember[]}
          />
        </div>
      </section>
    </>
  );
}
