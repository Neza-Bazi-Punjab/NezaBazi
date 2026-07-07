import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import Reveal from "@/components/Reveal";
import SectionHeading from "@/components/SectionHeading";
import {
  InstagramIcon,
  MapPinIcon,
  PhoneIcon,
  TrophyIcon,
  UsersIcon,
} from "@/components/icons";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with the Neza Bazi Punjab Championship organising team.",
};

const inputClasses =
  "w-full rounded-lg border border-bronze/30 bg-cream px-4 py-3 text-sm text-ink placeholder:text-brown/40 focus:border-bronze focus:outline-none";

export default function ContactPage() {
  return (
    <>
      <PageHeader
        title="Contact Us"
        intro="Questions about riding, registration or sponsorship? Reach the organising team directly using the details below."
      />

      <section className="bg-cream">
        <Reveal className="mx-auto grid max-w-6xl gap-12 px-6 py-16 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <SectionHeading>Get in Touch</SectionHeading>
            <ul className="mt-8 space-y-6 text-brown/85">
              <li className="flex items-start gap-4">
                <UsersIcon className="mt-1 h-6 w-6 shrink-0 text-bronze" />
                <div>
                  <p className="font-display text-sm font-bold uppercase tracking-[0.15em] text-ink">
                    Email
                  </p>
                  <a
                    href={`mailto:${site.email}`}
                    className="text-sm hover:text-bronze"
                  >
                    {site.email}
                  </a>
                </div>
              </li>
              <li className="flex items-start gap-4">
                <PhoneIcon className="mt-1 h-6 w-6 shrink-0 text-bronze" />
                <div>
                  <p className="font-display text-sm font-bold uppercase tracking-[0.15em] text-ink">
                    Phone
                  </p>
                  <a
                    href={`tel:${site.phone.replace(/\s/g, "")}`}
                    className="text-sm hover:text-bronze"
                  >
                    {site.phone}
                  </a>
                </div>
              </li>
              <li className="flex items-start gap-4">
                <InstagramIcon className="mt-1 h-6 w-6 shrink-0 text-bronze" />
                <div>
                  <p className="font-display text-sm font-bold uppercase tracking-[0.15em] text-ink">
                    Instagram
                  </p>
                  <a
                    href={site.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm hover:text-bronze"
                  >
                    {site.socialHandle}
                  </a>
                </div>
              </li>
              <li className="flex items-start gap-4">
                <MapPinIcon className="mt-1 h-6 w-6 shrink-0 text-bronze" />
                <div>
                  <p className="font-display text-sm font-bold uppercase tracking-[0.15em] text-ink">
                    Venue
                  </p>
                  <p className="text-sm">{site.venue}, India</p>
                </div>
              </li>
              <li className="flex items-start gap-4">
                <TrophyIcon className="mt-1 h-6 w-6 shrink-0 text-bronze" />
                <div>
                  <p className="font-display text-sm font-bold uppercase tracking-[0.15em] text-ink">
                    Become a Sponsor
                  </p>
                  <p className="text-sm">
                    Join {`the championship's`} partners — call{" "}
                    <a
                      href={`tel:${site.phone.replace(/\s/g, "")}`}
                      className="text-bronze hover:underline"
                    >
                      {site.phone}
                    </a>{" "}
                    or email{" "}
                    <a
                      href={`mailto:${site.email}?subject=Sponsorship enquiry`}
                      className="text-bronze hover:underline"
                    >
                      {site.email}
                    </a>
                    .
                  </p>
                </div>
              </li>
            </ul>
          </div>

          <div>
            <SectionHeading>Send a Message</SectionHeading>
            {/* Static UI only — submission is wired to Supabase in Phase 2 */}
            <form className="mt-8 space-y-4" aria-label="Contact form">
              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  type="text"
                  name="name"
                  placeholder="Your name"
                  className={inputClasses}
                />
                <input
                  type="email"
                  name="email"
                  placeholder="Your email"
                  className={inputClasses}
                />
              </div>
              <input
                type="text"
                name="subject"
                placeholder="Subject"
                className={inputClasses}
              />
              <textarea
                name="message"
                rows={5}
                placeholder="Your message"
                className={inputClasses}
              />
              <button
                type="button"
                disabled
                title="Online form launching soon"
                className="inline-flex cursor-not-allowed items-center gap-2.5 rounded-lg bg-bronze/50 px-6 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream"
              >
                Send Message
              </button>
              <p className="text-xs text-brown/60">
                The online form launches soon — for now, please email us
                directly at{" "}
                <a
                  href={`mailto:${site.email}`}
                  className="text-bronze underline"
                >
                  {site.email}
                </a>
                .
              </p>
            </form>
          </div>
        </Reveal>
      </section>
    </>
  );
}
