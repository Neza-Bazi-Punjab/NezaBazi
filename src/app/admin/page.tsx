import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";
import { createClient } from "@/lib/supabase/server";
import { site } from "@/lib/site";
import AdminDashboard, {
  type SoloRegistration,
  type Team,
  type TeamMember,
} from "./AdminDashboard";

export const metadata: Metadata = {
  title: "Admin Dashboard",
  description: `Admin dashboard for the ${site.title}.`,
};

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
  ] = await Promise.all([
    supabase
      .from("solo_registrations")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase.from("teams").select("*").order("created_at", { ascending: false }),
    supabase.from("team_members").select("*"),
  ]);

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
          />
        </div>
      </section>
    </>
  );
}
