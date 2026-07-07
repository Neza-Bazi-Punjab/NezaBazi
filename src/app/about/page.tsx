import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import ButtonLink from "@/components/Button";
import PageHeader from "@/components/PageHeader";
import Reveal from "@/components/Reveal";
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
        intro="Neza Bazi — tent pegging — is a mounted lance sport: gallop at full speed, strike a peg the size of a matchbox, and carry it clean off the ground before the line."
      />

      <section className="bg-cream">
        <Reveal className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 lg:grid-cols-2">
          <div>
            <SectionHeading>The Sport</SectionHeading>
            <div className="mt-6 space-y-4 leading-7 text-brown/85">
              <p>
                Neza Bazi is known internationally as tent pegging. A rider
                comes down the track at a full gallop, lance lowered, and has
                to strike a wooden peg driven into the ground — then carry it
                clear on the tip of the lance before crossing the line.
              </p>
              <p>
                Each run lasts only a few seconds. The margin for error is
                small: a rider who&apos;s a fraction late or off-line strikes
                the peg without lifting it, or misses it altogether. See{" "}
                <Link href="/rules" className="text-bronze underline">
                  Rules
                </Link>{" "}
                for how each run is scored.
              </p>
            </div>
          </div>
          {/* Shown at its natural aspect ratio so nothing is cropped */}
          <Image
            src="/images/aboutsport.webp"
            alt="A rider leans low off a white horse, lance planted on the peg"
            width={980}
            height={671}
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="h-auto w-full rounded-2xl shadow-md ring-1 ring-bronze/20"
          />
        </Reveal>
      </section>

      <section className="bg-sand">
        <Reveal className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 lg:grid-cols-2">
          {/* Shown at its natural aspect ratio so nothing is cropped */}
          <Image
            src="/images/heritage.webp"
            alt="A young rider in traditional dress runs the peg on a decorated horse"
            width={547}
            height={1024}
            sizes="(max-width: 1024px) 100vw, 24rem"
            className="order-last mx-auto h-auto w-full max-w-sm rounded-2xl shadow-md ring-1 ring-bronze/20 lg:order-first"
          />
          <div>
            <SectionHeading>Our Heritage</SectionHeading>
            <div className="mt-6 space-y-4 leading-7 text-brown/85">
              <p>
                In Punjab, Neza Bazi is practiced by Nihang riders and local
                horse clubs at melas and village fairs, usually in full
                traditional dress — the same look you&apos;ll see across our{" "}
                <Link href="/gallery" className="text-bronze underline">
                  gallery
                </Link>
                .
              </p>
              <p>
                Punjabi diaspora clubs have picked it up too. Jangi Horse Club
                UK and Jangi Horse Club Italy, two of this championship&apos;s
                partners, run their own Neza Bazi events abroad and send
                riders home to compete.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="bg-cream">
        <Reveal className="mx-auto max-w-6xl px-6 py-16">
          <SectionHeading>The Championship 2026</SectionHeading>
          <div className="mt-6 max-w-3xl space-y-4 leading-7 text-brown/85">
            <p>
              The Neza Bazi Punjab Championship 2026 is the first open
              championship of its kind — held on {site.eventDate} in{" "}
              {site.venue}, and welcoming riders from around the world,
              including Canada, the USA, the UK, Italy, Australia and Spain.
            </p>
            <p>
              The arena is lit for both day and night runs, with spectator
              seating, a large LED screen for replays, and stabling for the
              horses on site.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap gap-4">
            <ButtonLink href="/event">Event Details</ButtonLink>
            <ButtonLink href="/register" variant="outline">
              Register Now
            </ButtonLink>
          </div>
        </Reveal>
      </section>
    </>
  );
}
