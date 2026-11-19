import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Reveal from "@/components/Reveal";
import { HairlineBreak } from "@/components/redesign/Breaks";
import s from "@/components/redesign/shared.module.css";
import { InstagramMark } from "@/components/redesign/social";
import { photos } from "@/lib/photos-2026";
import { site } from "@/lib/site";
import c from "./champions.module.css";

export const metadata: Metadata = {
  title: "2026 Champions",
  description: `The solo and team podiums of the ${site.title} in Amritsar.`,
};

const SAND = "#f7efe4";
const CREAM = "#f2e4d2";

/* The 2026 podiums (the agreed draft, handoff/mock-home/champions.html):
   the solo podium on gold, silver and bronze plates, then the three teams
   with their prize-giving photos. Names as in src/data/stats/2026.json. */
export default function ChampionsPage() {
  return (
    <div className={`${s.page} ${c.champions}`}>
      <header className={c.top}>
        <div className={`${s.wrap} ${c.topGrid}`}>
          <Reveal>
            <h1 className={s.h1}>2026 Champions</h1>
            <p className={s.lead}>
              On 11 November 2026, riders and teams from Punjab and around the world came to
              Amritsar for the first open Neza Bazi championship. Bunty Singh won the solo title
              and Dal Baba Bidhi Chand Sahib took the team title, after a day of fast runs and
              clean pegs in front of a packed ground and viewers watching live worldwide.
            </p>
          </Reveal>
          <Reveal className={c.trophy}>
            <Image
              src={photos.trophies.src}
              alt={photos.trophies.alt}
              fill
              priority
              sizes="(max-width: 820px) 80vw, 540px"
            />
          </Reveal>
        </div>
      </header>

      <HairlineBreak from={SAND} to={CREAM} />

      <section className={c.solo} id="solo">
        <div className={s.wrap}>
          <Reveal className={c.head}>
            <h2 className={s.h2}>Solo podium</h2>
          </Reveal>
          <div className={c.podium}>
            <Reveal className={`${c.step} ${c.p2}`}>
              <div className={`${c.plate} ${s.silver}`}>
                <div className={c.place}>2nd</div>
                <div className={c.name}>Gurbir Singh</div>
              </div>
            </Reveal>
            <Reveal className={`${c.step} ${c.p1}`}>
              <div className={`${c.plate} ${s.gold}`}>
                <div className={c.place}>1st</div>
                <div className={c.name}>Bunty Singh</div>
              </div>
            </Reveal>
            <Reveal className={`${c.step} ${c.p3}`}>
              <div className={`${c.plate} ${s.bronzem}`}>
                <div className={c.place}>3rd</div>
                <div className={c.name}>Gurpreet Singh</div>
              </div>
            </Reveal>
          </div>
          <Reveal className={c.widePhoto}>
            <Image
              src={photos.solos_podium.src}
              alt={photos.solos_podium.alt}
              width={photos.solos_podium.width}
              height={photos.solos_podium.height}
              sizes="(max-width: 1032px) 100vw, 1000px"
            />
          </Reveal>
        </div>
      </section>

      <HairlineBreak from={CREAM} to={SAND} />

      <section className={c.teams} id="teams">
        <div className={s.wrap}>
          <Reveal className={c.head}>
            <h2 className={s.h2}>Team podiums</h2>
          </Reveal>

          <Reveal as="article" className={`${c.team} ${c.feature}`}>
            <div className={c.tphoto}>
              <Image
                src={photos.firstTeam.src}
                alt={photos.firstTeam.alt}
                width={photos.firstTeam.width}
                height={photos.firstTeam.height}
                sizes="(max-width: 1032px) 100vw, 1000px"
              />
            </div>
            <div>
              <span className={`${c.badge} ${s.gold}`}>1st place</span>
              <h3 className={c.tname}>Dal Baba Bidhi Chand Sahib</h3>
            </div>
          </Reveal>

          <Reveal as="article" className={c.team}>
            <div className={c.tphoto}>
              <Image
                src={photos.secondTeam.src}
                alt={photos.secondTeam.alt}
                width={photos.secondTeam.width}
                height={photos.secondTeam.height}
                sizes="(max-width: 820px) 100vw, 760px"
              />
            </div>
            <div>
              <span className={`${c.badge} ${s.silver}`}>2nd place</span>
              <h3 className={c.tname}>Punjab Armed Police (PAP)</h3>
            </div>
          </Reveal>

          <Reveal as="article" className={c.team}>
            <div className={c.tphoto}>
              <Image
                src={photos.thirdTeam.src}
                alt={photos.thirdTeam.alt}
                width={photos.thirdTeam.width}
                height={photos.thirdTeam.height}
                sizes="(max-width: 820px) 100vw, 760px"
              />
            </div>
            <div>
              <span className={`${c.badge} ${s.bronzem}`}>3rd place</span>
              <h3 className={c.tname}>Jangi Horse Club</h3>
            </div>
          </Reveal>
        </div>
      </section>

      <HairlineBreak from={SAND} to={CREAM} />

      <section className={c.end}>
        <Reveal className={s.wrap}>
          <div className={c.btnrow}>
            <Link className={`${s.btn} ${s.primary}`} href="/stats">
              View stats
            </Link>
            <a
              className={`${s.btn} ${s.outline}`}
              href={site.replayUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Watch live replay
            </a>
            <a
              className={`${s.btn} ${s.outline}`}
              href={site.instagram}
              target="_blank"
              rel="noopener noreferrer"
            >
              <InstagramMark /> Follow on Instagram
            </a>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
