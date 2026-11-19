import type { Metadata } from "next";
import Link from "next/link";
import Reveal from "@/components/Reveal";
import { HairlineBreak } from "@/components/redesign/Breaks";
import PageTop from "@/components/redesign/PageTop";
import s from "@/components/redesign/shared.module.css";
import { site } from "@/lib/site";
import e from "./event.module.css";

export const metadata: Metadata = {
  title: "Event",
  description:
    "How the Neza Bazi Punjab Championship works: Single Tent Pegging, four-rider team sections, who can enter, and how riders register and check in.",
};

/* The Event page (the agreed draft, handoff/mock-home/event.html), worded for
   the championship in general rather than one year. */

const competitions = [
  {
    title: "Single Tent Pegging",
    paragraphs: [
      "The individual competition. Each rider rides at full gallop to strike the peg and carry it across the line.",
      "Riders progress from a qualification round through the Aarhi knockout rounds, and the final round decides the placings.",
    ],
  },
  {
    title: "Section (Teams) Tent Pegging",
    paragraphs: [
      "The team competition, contested by sections of four riders. Each rider's score counts towards the team's total.",
      "The score required to advance rises with each round until the final placings are decided.",
    ],
  },
  {
    title: "Open to All Riders",
    paragraphs: [
      "The championship is open to riders from Punjab and around the world.",
      "Riders enter individually or as part of a four-rider section.",
    ],
  },
];

/* What this website itself does for riders. Google's OAuth brand review reads
   this section to confirm the sign-in button has a stated purpose: keep it. */
const riderAccountSteps = [
  {
    title: "Create your account",
    detail:
      "Sign up with your email address and a password, or use Continue with Google. Signing in with Google shares only your name, email address and profile picture with this site.",
  },
  {
    title: "Send your registration",
    detail:
      "Enter as a single rider, or as the leader of a four-rider section. You give your name, age, village or town, phone number and your horse's details.",
  },
  {
    title: "Get your check-in code",
    detail:
      "Every rider receives a confirmation code by email. Bring it to check-in the day before the championship; only riders who check in are drawn into the brackets.",
  },
];

export default function EventPage() {
  return (
    <div className={`${s.page} ${e.event}`}>
      <PageTop
        title="The Event"
        lead="How the Neza Bazi Punjab Championship works: Single Tent Pegging, four-rider team sections and a mounted cavalcade."
      />

      {/* The competitions, straight after the header */}
      <section className={e.band}>
        <Reveal className={s.wrap}>
          <div className={`${e.grid3} ${e.first}`}>
            {competitions.map((comp) => (
              <article key={comp.title} className={e.card}>
                <h3>{comp.title}</h3>
                {comp.paragraphs.map((text) => (
                  <p key={text}>{text}</p>
                ))}
              </article>
            ))}
          </div>
          <div className={e.rulesnote}>
            <p>Rules, scoring and horse welfare: see the official rulebook, in English and Punjabi.</p>
            <Link className={e.rlink} href="/rules">
              Open the rulebook →
            </Link>
          </div>
        </Reveal>
      </section>

      <HairlineBreak from="#f2e4d2" to="#f7efe4" />

      {/* Rider accounts (kept: Google's sign-in review reads this section) */}
      <section className={`${e.band} ${e.sand}`} id="accounts">
        <Reveal className={s.wrap}>
          <div className={e.head}>
            <h2 className={s.h2}>Manage Your Entry</h2>
          </div>
          <ol className={e.grid3}>
            {riderAccountSteps.map((step, index) => (
              <li key={step.title} className={e.card}>
                <div className={e.num}>{String(index + 1).padStart(2, "0")}</div>
                <h3>{step.title}</h3>
                <p>{step.detail}</p>
              </li>
            ))}
          </ol>
        </Reveal>
      </section>

      <HairlineBreak from="#f7efe4" to="#f2e4d2" />

      {/* Contact */}
      <section className={e.band}>
        <Reveal className={`${s.wrap} ${e.contact}`}>
          <div>
            <h2 className={s.h2}>Get in Touch</h2>
            <p className={s.lead}>Questions about riding? Reach the team directly.</p>
          </div>
          <ul>
            <li>
              <b>Email</b>
              <a className={e.link} href={`mailto:${site.email}`}>
                {site.email}
              </a>
            </li>
            <li>
              <b>Instagram</b>
              <a className={e.link} href={site.instagram} target="_blank" rel="noopener noreferrer">
                {site.socialHandle}
              </a>
            </li>
            <li>
              <b>YouTube</b>
              <a className={e.link} href={site.youtube} target="_blank" rel="noopener noreferrer">
                {site.name}
              </a>
            </li>
          </ul>
        </Reveal>
      </section>
    </div>
  );
}
