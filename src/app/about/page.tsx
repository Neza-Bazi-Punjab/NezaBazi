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
    "Neza Bazi, known internationally as tent pegging, is Punjab's mounted lance sport. Learn how it works and about the Championship 2026.",
};

export default function AboutPage() {
  return (
    <>
      <PageHeader
        title="About Neza Bazi"
        intro="Neza Bazi is known internationally as tent pegging. A rider comes down the track at a full gallop, lance lowered, and has to strike a wooden peg driven into the ground — then carry it clear on the tip of the lance before crossing the line."
      />

      <section className="bg-cream">
        <Reveal className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 lg:grid-cols-2">
          <div>
            <SectionHeading>The Sport & The Championship</SectionHeading>
            <div className="mt-6 space-y-4 leading-7 text-brown/85">
              <p>
                Each run lasts only a few seconds. The margin for error is
                small: a rider who&apos;s a fraction late or off-line strikes
                the peg without lifting it, or misses it altogether. See the{" "}
                <Link href="/rules" className="text-bronze underline">
                  Rulebook
                </Link>{" "}
                for how each run is scored.
              </p>
              <p>
                Neza Bazi has a long history in Punjab. Nihang Singhs have
                practiced it for many years as part of their horse-riding and
                warrior traditions. Riders often wear traditional clothes and
                ride decorated horses.
              </p>
              <p>
                The Neza Bazi Punjab Championship 2026 will be held on{" "}
                {site.eventDate}, in {site.venue}. Riders from many countries
                will come to take part.
              </p>
              <p>
                The event will have day and night rides, lights around the
                arena, seats for visitors, a large screen, and space for the
                horses.
              </p>
            </div>
            <div className="mt-8 flex flex-wrap gap-4">
              <ButtonLink href="/rules" variant="outline">
                View Rules
              </ButtonLink>
              <ButtonLink href="/register">Register Now</ButtonLink>
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

      {/* Contact: the site's channels, spelled out once in full */}
      <section className="bg-sand">
        <Reveal className="mx-auto max-w-6xl px-6 py-16">
          <SectionHeading>Get in Touch</SectionHeading>
          <p className="mt-6 max-w-xl leading-7 text-brown/85">
            Questions about riding, registration or the event? Reach the team
            directly:
          </p>
          <ul className="mt-6 space-y-3 text-brown/85">
            <li>
              <span className="font-display text-sm font-bold uppercase tracking-[0.15em] text-ink">
                Email:{" "}
              </span>
              <a
                href={`mailto:${site.email}`}
                className="text-bronze underline"
              >
                {site.email}
              </a>
            </li>
            <li>
              <span className="font-display text-sm font-bold uppercase tracking-[0.15em] text-ink">
                Instagram:{" "}
              </span>
              <a
                href={site.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="text-bronze underline"
              >
                {site.socialHandle}
              </a>
            </li>
            <li>
              <span className="font-display text-sm font-bold uppercase tracking-[0.15em] text-ink">
                YouTube:{" "}
              </span>
              <a href={site.youtube} className="text-bronze underline">
                {site.name}
              </a>
            </li>
          </ul>
        </Reveal>
      </section>
    </>
  );
}
