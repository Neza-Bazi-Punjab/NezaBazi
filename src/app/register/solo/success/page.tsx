import type { Metadata } from "next";
import Link from "next/link";
import ConfirmationCode from "@/components/ConfirmationCode";
import PageHeader from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Registration Received",
  description: "Your solo rider registration has been received.",
};

export default async function RegisterSuccessPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Read the code back rather than passing it through the URL: a confirmation
  // code in a query string ends up in browser history, logs and shared links.
  const { data: registration } = user
    ? await supabase
        .from("solo_registrations")
        .select("confirmation_code")
        .eq("profile_id", user.id)
        .maybeSingle()
    : { data: null };

  return (
    <>
      <PageHeader
        title="Registration Received"
        intro="Your solo registration was successfully submitted."
      />

      <section className="bg-cream">
        <div className="mx-auto max-w-xl space-y-6 px-6 py-16">
          {registration?.confirmation_code ? (
            <>
              <div>
                <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-bronze-dark">
                  Your confirmation code
                </p>
                <div className="mt-3">
                  <ConfirmationCode code={registration.confirmation_code} />
                </div>
              </div>

              <div className="rounded-lg border-l-4 border-bronze bg-sand px-5 py-4 leading-7 text-brown">
                <p>
                  {`Check-in is on ${site.checkInDate}, the day before the event, at ${site.venue}. Bring this code with you — an official will look it up and confirm you have arrived.`}
                </p>
                <p className="mt-3 font-semibold">
                  Riders who do not check in are not entered into the brackets.
                </p>
              </div>

              <p className="leading-7 text-brown/85">
                {`We have emailed this code to you. You can also find it any time on your account page.`}
              </p>
            </>
          ) : (
            <p className="leading-7 text-brown/85">
              {`Your registration was received. We will contact you with your check-in code and further event details.`}
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
