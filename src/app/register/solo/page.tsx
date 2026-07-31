import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";
import { isAccountProfileComplete } from "@/lib/account-profile";
import type { SoloDraftData } from "@/lib/registration-drafts";
import { hasConfirmedEmail } from "@/lib/supabase/email-confirmation";
import { createClient } from "@/lib/supabase/server";
import { site } from "@/lib/site";
import RegisterForm from "./RegisterForm";

export const metadata: Metadata = {
  title: "Solo Registration",
  description: `Solo rider registration for the ${site.title}.`,
};

type RegistrationMetadata = {
  full_name?: string;
  age?: number | string;
  location?: string;
  phone?: string;
  years_experience?: number | string;
  horse_name?: string;
  horse_age?: number | string;
  horse_breed?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  headshot_path?: string;
};

const getMetadataNumber = (value: number | string | undefined) => {
  if (value == null || value === "") {
    return undefined;
  }

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? undefined : numberValue;
};

export default async function SoloRegisterPage() {
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
  const isEmailConfirmed = hasConfirmedEmail(user);
  const authMetadata = user?.user_metadata as RegistrationMetadata | undefined;

  /* The rider fields below render locked, filled from the account. An account
     that reached here without them came in through Google and skipped the
     completion step — a bookmark, or the back button — and would be staring at
     four blank boxes it cannot type into. Send it back to fill them in. */
  if (user && isEmailConfirmed && !isAdmin && !isAccountProfileComplete(authMetadata)) {
    redirect(`/complete-profile?next=${encodeURIComponent("/register/solo")}`);
  }

  const { data: existingRegistration } = !isAdmin && user
    ? await supabase
        .from("solo_registrations")
        .select("id")
        .eq("profile_id", user.id)
        .maybeSingle()
    : { data: null };

  // Restore the autosaved draft (RLS limits the read to the user's own row).
  const { data: draftRow } = user
    ? await supabase
        .from("registration_drafts")
        .select("data")
        .eq("profile_id", user.id)
        .eq("draft_type", "solo")
        .maybeSingle()
    : { data: null };

  return (
    <>
      <PageHeader
        title="Solo Registration"
        intro={`Submit your solo rider details for the ${site.title} in ${site.venue}.`}
      />

      <section className="bg-cream">
        <div className="mx-auto max-w-xl px-6 py-16">
          {user ? (
            !isEmailConfirmed ? (
              <>
                <SectionHeading>Confirm Your Email</SectionHeading>

                <div className="mt-10 space-y-6">
                  <p className="leading-7 text-brown/85">
                    Check your inbox and confirm your email address before registering.
                  </p>
                </div>
              </>
            ) : !isAdmin && existingRegistration ? (
              <>
                <SectionHeading>Already Registered</SectionHeading>

                <div className="mt-10 space-y-6">
                  <p className="leading-7 text-brown/85">
                    You have already registered for solo competition.
                  </p>
                </div>
              </>
            ) : (
              <>
                <SectionHeading>Rider Details</SectionHeading>
                <RegisterForm
                  lockProfileFields={!isAdmin}
                  initialDraft={(draftRow?.data ?? null) as SoloDraftData | null}
                  initialHeadshotPath={
                    typeof authMetadata?.headshot_path === "string"
                      ? authMetadata.headshot_path
                      : null
                  }
                  initialValues={
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
                          horse_name: authMetadata?.horse_name ?? "",
                          horse_age: getMetadataNumber(authMetadata?.horse_age),
                          horse_breed: authMetadata?.horse_breed ?? "",
                          emergency_contact_name:
                            authMetadata?.emergency_contact_name ?? "",
                          emergency_contact_phone:
                            authMetadata?.emergency_contact_phone ?? "",
                        }
                  }
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
                  href="/login?redirect=/register/solo"
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
