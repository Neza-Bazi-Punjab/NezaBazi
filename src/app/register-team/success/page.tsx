import type { Metadata } from "next";
import Link from "next/link";
import ConfirmationCode from "@/components/ConfirmationCode";
import PageHeader from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Team Registration Received",
  description: "Your team registration has been received.",
};

export default async function RegisterTeamSuccessPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: team } = user
    ? await supabase
        .from("teams")
        .select("id, team_name")
        .eq("leader_profile_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  // All four codes are shown to the leader on purpose. Riders 2-4 have no
  // account here, so email is their only channel — and if a rider mistyped
  // their address, the leader is the one who can pass the code along.
  const { data: members } = team
    ? await supabase
        .from("team_members")
        .select("id, full_name, confirmation_code, is_leader")
        .eq("team_id", team.id)
        .order("is_leader", { ascending: false })
    : { data: null };

  return (
    <>
      <PageHeader
        title="Team Registration Received"
        intro="Your team's registration was successfully submitted."
      />

      <section className="bg-cream">
        <div className="mx-auto max-w-xl space-y-6 px-6 py-16">
          {members && members.length > 0 ? (
            <>
              <div>
                <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-bronze-dark">
                  Confirmation codes
                </p>
                <p className="mt-2 leading-7 text-brown/85">
                  {`Every rider has their own code, and each one has been emailed to that rider. Check in is per rider — pass these on if a teammate does not receive theirs.`}
                </p>
                <div className="mt-4 space-y-3">
                  {members.map((member) => (
                    <ConfirmationCode
                      key={member.id}
                      code={member.confirmation_code}
                      riderName={`${member.full_name}${
                        member.is_leader ? " (Team Leader)" : ""
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-lg border-l-4 border-bronze bg-sand px-5 py-4 leading-7 text-brown">
                <p>
                  {`Check-in is on ${site.checkInDate}, the day before the event, at ${site.venue}. Each rider brings their own code.`}
                </p>
                <p className="mt-3 font-semibold">
                  {`All four riders must check in for the team to be entered into the brackets.`}
                </p>
              </div>
            </>
          ) : (
            <p className="leading-7 text-brown/85">
              {`Your team's registration was received. The team leader will be contacted with check-in codes and further event details.`}
            </p>
          )}

          <div className="space-y-3 pt-2">
            <Link
              href="/account"
              className="block w-full rounded-lg bg-bronze-deep px-6 py-3 text-center font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze"
            >
              View My Account
            </Link>
            <Link
              href="/"
              className="block w-full rounded-lg border border-bronze/40 px-6 py-3 text-center font-display text-sm font-semibold uppercase tracking-[0.15em] text-brown transition-colors hover:bg-sand"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
