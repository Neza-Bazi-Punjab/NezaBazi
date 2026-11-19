import Image from "next/image";
import Link from "next/link";
import AddToHomeScreen from "@/components/AddToHomeScreen";
import { SwirlBreak } from "@/components/redesign/Breaks";
import PhotoStrip from "@/components/redesign/PhotoStrip";
import ReplayPlayer from "@/components/redesign/ReplayPlayer";
import s from "@/components/redesign/shared.module.css";
import { SocialIcons } from "@/components/redesign/social";
import { homeStrip, photos } from "@/lib/photos-2026";
import { site } from "@/lib/site";
import h from "./home.module.css";

/* The flags of the riders' nations, as on the poster: the Nishan Sahib
   pennant, then Canada, USA, UK, Italy, Australia and Spain. */
const flags = [
  { name: "Canada", src: "/flags/Canada.svg" },
  { name: "United States", src: "/flags/UnitedStates.webp" },
  { name: "United Kingdom", src: "/flags/UK.webp" },
  { name: "Italy", src: "/flags/Italy.webp" },
  { name: "Australia", src: "/flags/Australia.svg" },
  { name: "Spain", src: "/flags/Spain.webp" },
];

/* Home page, after the 2026 championship (the agreed draft,
   handoff/mock-home/home.html): the hero, the two champions, a sideways
   photo strip, the full broadcast, and a closing thank-you photo, joined by
   the brown and gold swirl breaks. */
export default function Home() {
  return (
    <div className={`${s.page} ${h.home}`}>
      {/* Hero */}
      <section className={h.hero}>
        <div className={h.fade}>
          <Image
            src={photos.hero.src}
            alt={photos.hero.alt}
            fill
            priority
            sizes="(max-width: 820px) 100vw, 66vw"
          />
        </div>
        <div className={`${s.wrap} ${h.inner}`}>
          <div className={h.text}>
            <div className={h.flags}>
              <Image
                className={h.pennant}
                src="/flags/nishan-sahib.webp"
                alt="Nishan Sahib"
                width={1672}
                height={941}
                unoptimized
              />
              {flags.map((flag) => (
                <Image
                  key={flag.name}
                  src={flag.src}
                  alt={flag.name}
                  title={flag.name}
                  width={40}
                  height={26}
                  unoptimized
                />
              ))}
            </div>
            <p className={s.kicker}>1st Open Tent-Pegging Championship</p>
            <h1 className={h.title}>
              <span className={h.l}>Neza Bazi</span>
              <span className={`${h.l} ${h.p}`}>Punjab</span>
              <span className={h.s}>Championship 2026</span>
            </h1>
            <p className={h.desc}>
              Punjab&apos;s first open tent-pegging championship came to Amritsar on 11 November
              2026, bringing together riders from across the world. Thank you to every rider,
              team and fan who helped keep the art of Neza Bazi alive.
            </p>
            <div className={h.ctas}>
              <a className={`${s.btn} ${s.primary}`} href="#replay">
                Live Replay
              </a>
              <Link className={`${s.btn} ${s.outline}`} href="/gallery">
                Gallery
              </Link>
              <Link className={`${s.btn} ${s.outline}`} href="/stats">
                Stats
              </Link>
              <SocialIcons className={h.socials} />
            </div>
          </div>
        </div>
        <SwirlBreak n={1} className={h.heroBreak} />
      </section>

      {/* 1. Champions band */}
      <section className={h.champs} id="champions">
        <div className={`${s.wrap} ${h.champsGrid}`}>
          <div>
            <div className={h.trophy}>
              <Image
                src={photos.trophies.src}
                alt={photos.trophies.alt}
                fill
                sizes="(max-width: 820px) 100vw, 480px"
              />
            </div>
          </div>
          <div>
            <h2 className={s.h2}>The 2026 Champions</h2>
            <div className={h.winners}>
              <div className={h.win}>
                <span className={h.role}>Solo champion</span>
                <span className={h.who}>Bunty Singh</span>
              </div>
              <div className={h.win}>
                <span className={h.role}>Team champions</span>
                <span className={h.who}>Dal Baba Bidhi Chand Sahib</span>
              </div>
            </div>
            <Link className={`${s.btn} ${s.outline}`} href="/champions">
              See the full podium
            </Link>
          </div>
        </div>
      </section>

      <SwirlBreak n={2} />

      {/* 2. Photo strip */}
      <section className={h.strip} id="photos">
        <PhotoStrip photos={homeStrip} />
      </section>

      <SwirlBreak n={3} />

      {/* 3. The full broadcast */}
      <section className={h.replay} id="replay">
        <div className={s.wrap}>
          <div className={h.replayHead}>
            <h2 className={s.h2}>Full broadcast</h2>
            <p>
              Available on{" "}
              <a href={site.replayUrl} target="_blank" rel="noopener noreferrer">
                YouTube
              </a>
            </p>
          </div>
          <ReplayPlayer poster={photos.replayPoster} />
        </div>
      </section>

      {/* 4. Closing photo */}
      <section className={h.closing}>
        <div className={h.closingPhoto}>
          <SwirlBreak n={4} className={h.closingBreak} />
          <Image src={photos.groupPhoto.src} alt={photos.groupPhoto.alt} fill sizes="100vw" />
        </div>
        <div className={h.closingText}>
          <h2 className={s.h2}>Thank you</h2>
          <p>See you again soon.</p>
          <SocialIcons className={h.closingSocials} />
        </div>
      </section>

      {/* Floating round button, bottom right: phones only; draws nothing on
          desktop, in the installed app, or once tapped or hidden. */}
      <AddToHomeScreen />
    </div>
  );
}
