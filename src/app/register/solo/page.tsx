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

export default async function SoloRegisterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("full_name, age, location, phone, years_experience, horse_age, horse_breed")
        .eq("id", user.id)
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
            <>
              <SectionHeading>Rider Details</SectionHeading>
              <RegisterForm
                initialValues={{
                  full_name: profile?.full_name,
                  age: profile?.age,
                  location: profile?.location,
                  phone: profile?.phone,
                  email: user.email,
                  years_experience: profile?.years_experience,
                  horse_age: profile?.horse_age,
                  horse_breed: profile?.horse_breed,
                }}
              />
            </>
          ) : (
            <>
              <SectionHeading>Login Required</SectionHeading>

              <div className="mt-10 space-y-6">
                <p className="leading-7 text-brown/85">
                  You must be logged in to register for the event.
                </p>

                <Link
                  href="/login"
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
