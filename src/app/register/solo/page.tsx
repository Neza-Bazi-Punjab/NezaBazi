import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";
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
  const authMetadata = user?.user_metadata as RegistrationMetadata | undefined;

  const { data: existingRegistration } = !isAdmin && user
    ? await supabase
        .from("solo_registrations")
        .select("id")
        .eq("profile_id", user.id)
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
            !isAdmin && existingRegistration ? (
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
                          horse_age: getMetadataNumber(authMetadata?.horse_age),
                          horse_breed: authMetadata?.horse_breed,
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
