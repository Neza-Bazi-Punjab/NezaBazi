import type { Metadata } from "next";
import ButtonLink from "@/components/Button";
import ImagePlaceholder from "@/components/ImagePlaceholder";
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description:
    "Neza Bazi — tent pegging — is the historic equestrian sport of Punjab. Learn about its heritage and the Championship 2026.",
};

export default function AboutPage() {
  return (
    <>
      <PageHeader
        title="About Neza Bazi"
        intro="The brave and historic equestrian sport of Punjab — a test of skill, speed and precision that reflects our rich heritage and warrior spirit."
      />

      <section className="bg-cream">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 lg:grid-cols-2">
          <div>
            <SectionHeading>The Sport</SectionHeading>
            <div className="mt-6 space-y-4 leading-7 text-brown/85">
              <p>
                Neza Bazi — known internationally as tent pegging — is one of
                the world&apos;s oldest equestrian disciplines. A rider at full
                gallop lowers a lance and strikes a small ground target, lifting
                it cleanly from the earth in a single fluid motion.
              </p>
              <p>
                Success demands total harmony between horse and rider: raw
                speed, an unshakeable seat, and pinpoint accuracy delivered in
                under ten seconds of thundering hooves.
              </p>
            </div>
          </div>
          <ImagePlaceholder
            name="about-sport.jpg"
            label="Lance striking the peg"
            className="aspect-[4/3]"
          />
        </div>
      </section>

      <section className="bg-sand">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 lg:grid-cols-2">
          <ImagePlaceholder
            name="about-heritage.jpg"
            label="Riders in traditional dress"
            className="order-last aspect-[4/3] lg:order-first"
          />
          <div>
            <SectionHeading>Our Heritage</SectionHeading>
            <div className="mt-6 space-y-4 leading-7 text-brown/85">
              <p>
                In Punjab, Neza Bazi carries centuries of warrior tradition.
                Passed down through generations of horsemen, it lives on today
                at melas and festivals across the region — a proud display of
                courage, faith and horsemanship.
              </p>
              <p>
                The sport remains a living link to Punjab&apos;s cavalry
                heritage, celebrated by communities at home and across the
                diaspora.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-cream">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <SectionHeading>The Championship 2026</SectionHeading>
          <div className="mt-6 max-w-3xl space-y-4 leading-7 text-brown/85">
            <p>
              The Neza Bazi Punjab Championship 2026 is the first open
              championship of its kind — held on {site.eventDate} in{" "}
              {site.venue}, and welcoming riders from around the world,
              including Canada, the USA, the UK, Italy, Australia and Spain.
            </p>
            <p>
              With a fully lit arena for night and day events, premium
              spectator seating, a big LED display for live action and complete
              horse staging facilities, the championship sets a new standard
              for the sport in Punjab.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap gap-4">
            <ButtonLink href="/event">Event Details</ButtonLink>
            <ButtonLink href="/register" variant="outline">
              Register Now
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
