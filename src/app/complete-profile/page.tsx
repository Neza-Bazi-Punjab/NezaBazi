// The step a Google sign-in lands on before anything else.
//
// Google hands back an email, a display name and an avatar. It has no age,
// location or phone to give, and this site needs all three: they are what a
// registration is made of, and syncRegistrationProfileFromUser refuses to run
// against an account missing any of them. Password signup collects them on the
// form, so only OAuth accounts ever arrive here.
//
// Placed on its own page rather than folded into /account: a rider arriving
// here is midway through signing up, not administering an existing account, and
// this page has to hand them onward to wherever they were originally going.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";
import { isAccountProfileComplete } from "@/lib/account-profile";
import { getPostSignupRedirect } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import { site } from "@/lib/site";
import CompleteProfileForm from "./CompleteProfileForm";

export const metadata: Metadata = {
  title: "Complete Your Profile",
  description: `Finish setting up your rider account for the ${site.title}.`,
};

type CompleteProfilePageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function CompleteProfilePage({
  searchParams,
}: CompleteProfilePageProps) {
  const { next } = await searchParams;
  // Same default as the signup flow: with nowhere particular to return to, a
  // rider who has just made an account is heading for registration.
  const destination = getPostSignupRedirect(next ?? null);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(destination)}`);
  }

  // Nothing to complete — including for every password account, which collected
  // all four fields at signup. Guards against a stale link or a back button
  // landing someone on a form they have already filled in.
  if (isAccountProfileComplete(user.user_metadata)) {
    redirect(destination);
  }

  const metadata = user.user_metadata ?? {};

  return (
    <>
      <PageHeader
        title="Complete Your Profile"
        intro="Google gave us your name and email. We need a few more details before you can register."
      />

      <section className="bg-cream">
        <div className="mx-auto max-w-xl px-6 py-16">
          <SectionHeading>Your Details</SectionHeading>

          <CompleteProfileForm
            next={destination}
            email={user.email ?? ""}
            initialFullName={
              typeof metadata.full_name === "string" ? metadata.full_name : ""
            }
            initialAge={
              metadata.age == null || metadata.age === "" ? "" : String(metadata.age)
            }
            initialLocation={
              typeof metadata.location === "string" ? metadata.location : ""
            }
            initialPhone={typeof metadata.phone === "string" ? metadata.phone : ""}
          />
        </div>
      </section>
    </>
  );
}
