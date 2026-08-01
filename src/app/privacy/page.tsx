import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Neza Bazi Punjab collects, uses, stores, shares, and deletes personal information, including data used for Google sign-in.",
  alternates: { canonical: "/privacy" },
};

const headingClassName =
  "font-display text-2xl font-bold uppercase tracking-wide text-bronze-dark sm:text-3xl";
const paragraphClassName = "mt-4 leading-7 text-brown/85";
const listClassName = "mt-4 list-disc space-y-3 pl-6 leading-7 text-brown/85";

export default function PrivacyPolicyPage() {
  return (
    <>
      <PageHeader
        title="Privacy Policy"
        intro="How Neza Bazi Punjab handles personal information when you use our website, create an account, or register for the championship."
      />

      <section className="bg-cream">
        <article className="mx-auto max-w-3xl px-6 py-16">
          <div className="rounded-xl border border-bronze/25 bg-sand p-6 text-sm leading-7 text-brown sm:p-8">
            <p>
              <strong className="text-ink">Effective date:</strong> July 31, 2026
            </p>
            <p>
              <strong className="text-ink">Last updated:</strong> July 31, 2026
            </p>
            <p>
              <strong className="text-ink">Privacy contact:</strong>{" "}
              <a
                href={"mailto:" + site.email}
                className="font-semibold text-bronze-deep underline underline-offset-2"
              >
                {site.email}
              </a>
            </p>
          </div>

          <div className="mt-14 space-y-14">
            <section aria-labelledby="policy-scope">
              <h2 id="policy-scope" className={headingClassName}>
                Who we are and what this policy covers
              </h2>
              <p className={paragraphClassName}>
                Neza Bazi Punjab operates {site.name} and the website at
                nezabazipunjab.com. This policy explains how we handle personal
                information when you browse the website, create or use an account,
                register for the championship, communicate with us, or check in for
                the event.
              </p>
            </section>

            <section aria-labelledby="adults-only">
              <h2 id="adults-only" className={headingClassName}>
                Adults only
              </h2>
              <p className={paragraphClassName}>
                The website, accounts, and online registration are intended for
                people 18 years of age or older. We do not knowingly collect personal
                information from children. If you believe a child has provided
                information to us, please contact us so we can review and delete it.
              </p>
            </section>

            <section aria-labelledby="information-collected">
              <h2 id="information-collected" className={headingClassName}>
                Information we collect
              </h2>
              <ul className={listClassName}>
                <li>
                  <strong className="text-ink">Google sign-in information.</strong>{" "}
                  When you choose Google sign-in, we request the basic{" "}
                  <code>openid</code>, <code>email</code>, and <code>profile</code>{" "}
                  scopes. Google may provide your name, email address, profile image,
                  and Google account identifier.
                </li>
                <li>
                  <strong className="text-ink">Account and rider information.</strong>{" "}
                  This may include your full name, age, location, phone number, email
                  address, login details, and optional headshot.
                </li>
                <li>
                  <strong className="text-ink">Competition information.</strong> This
                  may include solo or team registration, team name and membership,
                  Neza Bazi experience, horse name, age and breed, emergency-contact
                  details, registration confirmation codes, and check-in status. If
                  you provide information about another person, such as a teammate or
                  emergency contact, you should have their permission to do so.
                </li>
                <li>
                  <strong className="text-ink">Technical information.</strong> Our
                  website and service providers may process information such as IP
                  address, browser and device type, request and security logs, pages
                  visited, and website performance information. We also use cookies
                  and similar browser storage where needed to keep you signed in and
                  support account features.
                </li>
              </ul>
            </section>

            <section aria-labelledby="information-use">
              <h2 id="information-use" className={headingClassName}>
                How we use information
              </h2>
              <p className={paragraphClassName}>We use information to:</p>
              <ul className={listClassName}>
                <li>Authenticate users and create, secure, and manage accounts.</li>
                <li>
                  Process solo and team registrations, organize the competition, and
                  administer confirmation codes and event check-in.
                </li>
                <li>
                  Communicate about accounts, registration, security, support, and
                  event operations.
                </li>
                <li>
                  Prevent fraud and abuse, troubleshoot problems, enforce our rules,
                  and protect riders, officials, the public, and our services.
                </li>
                <li>
                  Understand aggregate website use and improve reliability and
                  performance.
                </li>
              </ul>
            </section>

            <section aria-labelledby="google-data">
              <h2 id="google-data" className={headingClassName}>
                How we use Google user data
              </h2>
              <p className={paragraphClassName}>
                We use information received from Google only to sign you in, create
                and manage your account, prefill available profile information, and
                provide the rider-facing account and registration features you
                request. We store the account information needed for these purposes
                with our authentication and database provider, Supabase.
              </p>
              <p className={paragraphClassName}>
                We do not sell your personal information or Google user data, and we
                do not use Google user data for targeted advertising. We do not use
                it for purposes unrelated to the features described in this policy.
              </p>
            </section>

            <section aria-labelledby="information-sharing">
              <h2 id="information-sharing" className={headingClassName}>
                How information is shared
              </h2>
              <p className={paragraphClassName}>
                We disclose limited information to service providers acting for Neza
                Bazi Punjab when needed to operate the website and event:
              </p>
              <ul className={listClassName}>
                <li>
                  <strong className="text-ink">Google</strong> provides Google sign-in
                  and processes the authorization request you choose to make.
                </li>
                <li>
                  <strong className="text-ink">Supabase</strong> provides
                  authentication, database services, and private file storage,
                  including optional rider headshots.
                </li>
                <li>
                  <strong className="text-ink">Resend</strong> delivers transactional
                  emails such as registration and confirmation-code messages.
                </li>
                <li>
                  <strong className="text-ink">GeoNames</strong> provides optional
                  location suggestions. The country, state, and location-search text
                  needed to return suggestions may be sent to GeoNames.
                </li>
                <li>
                  <strong className="text-ink">Vercel</strong> hosts the website and
                  provides analytics and performance monitoring.
                </li>
              </ul>
              <p className={paragraphClassName}>
                We may also disclose information when you direct or consent to it, or
                when we reasonably believe disclosure is necessary to comply with
                law, respond to legal process, investigate fraud or security issues,
                protect safety, or defend legal rights. We do not allow service
                providers to use Google user data for their own advertising purposes.
              </p>
            </section>

            <section aria-labelledby="retention-deletion">
              <h2 id="retention-deletion" className={headingClassName}>
                Retention and deletion
              </h2>
              <p className={paragraphClassName}>
                We keep personal information only for as long as reasonably necessary
                to operate accounts, administer the championship, communicate with
                riders, maintain security and event records, resolve disputes, and
                meet legal obligations.
              </p>
              <p className={paragraphClassName}>
                You may request access, correction, or deletion by emailing{" "}
                <a
                  href={"mailto:" + site.email}
                  className="font-semibold text-bronze-deep underline underline-offset-2"
                >
                  {site.email}
                </a>
                . We may require identity verification before acting on a request.
                Some information may be retained where reasonably necessary for
                security, fraud prevention, disputes, or legal obligations. After
                deletion from active systems, copies may take a reasonable period to
                disappear from protected backups.
              </p>
            </section>

            <section aria-labelledby="security">
              <h2 id="security" className={headingClassName}>
                Security
              </h2>
              <p className={paragraphClassName}>
                We and our providers use reasonable administrative, technical, and
                organizational safeguards designed to protect personal information.
                No website, transmission, or storage system is completely secure, so
                we cannot guarantee absolute security.
              </p>
            </section>

            <section aria-labelledby="international-processing">
              <h2 id="international-processing" className={headingClassName}>
                International processing
              </h2>
              <p className={paragraphClassName}>
                Neza Bazi Punjab and our service providers may process information in
                countries other than the country where you live. Privacy and data
                protection laws in those countries may differ from local laws.
              </p>
            </section>

            <section aria-labelledby="choices-rights">
              <h2 id="choices-rights" className={headingClassName}>
                Your choices and rights
              </h2>
              <p className={paragraphClassName}>
                You can review or update available profile details through your
                account. You can revoke Neza Bazi Punjab&apos;s future access to your
                Google account through your{" "}
                <a
                  href="https://myaccount.google.com/connections"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-bronze-deep underline underline-offset-2"
                >
                  Google Account connections
                </a>
                . Revoking Google access does not automatically delete information
                already stored with your Neza Bazi Punjab account; contact us to
                request deletion. Depending on where you live, you may also have
                legal rights concerning access, correction, deletion, restriction,
                or objection. Email us to make a request.
              </p>
            </section>

            <section aria-labelledby="policy-changes">
              <h2 id="policy-changes" className={headingClassName}>
                Changes to this policy
              </h2>
              <p className={paragraphClassName}>
                We may update this policy as our services or legal obligations change.
                We will post the updated policy here and revise the last-updated date.
                When appropriate, we will provide additional notice of material
                changes before using information for a materially different purpose.
              </p>
            </section>

            <section aria-labelledby="contact-us">
              <h2 id="contact-us" className={headingClassName}>
                Contact us
              </h2>
              <p className={paragraphClassName}>
                For privacy questions or requests, contact Neza Bazi Punjab at{" "}
                <a
                  href={"mailto:" + site.email}
                  className="font-semibold text-bronze-deep underline underline-offset-2"
                >
                  {site.email}
                </a>
                .
              </p>
            </section>
          </div>
        </article>
      </section>
    </>
  );
}
