import type { Metadata } from "next";
import Reveal from "@/components/Reveal";
import { HairlineBreak } from "@/components/redesign/Breaks";
import s from "@/components/redesign/shared.module.css";
import { InstagramMark } from "@/components/redesign/social";
import { galleryPhotos } from "@/lib/photos-2026";
import { site } from "@/lib/site";
import g from "./gallery.module.css";
import GalleryGrid from "./GalleryGrid";

export const metadata: Metadata = {
  title: "Gallery",
  description: `Photos from the ${site.title} in Amritsar, 11 November 2026.`,
};

/* The 2026 photos (the agreed draft, handoff/mock-home/gallery.html): a
   masonry grid where each photo keeps its own shape, a full-screen viewer,
   and one Instagram button to end. */
export default function GalleryPage() {
  return (
    <div className={`${s.page} ${g.gallery}`}>
      <header className={g.top}>
        <Reveal className={s.wrap}>
          <h1 className={s.h1}>Amritsar 2026</h1>
          <p className={`${s.lead} ${g.lead}`}>
            Photos from the first Neza Bazi Punjab Championship, 11 November 2026.
          </p>
        </Reveal>
      </header>
      <HairlineBreak from="#fffdf9" to="#f2e4d2" />

      <div className={g.wide}>
        <GalleryGrid photos={galleryPhotos} />
      </div>

      <section className={g.gend}>
        <a className={g.igbtn} href={site.instagram} target="_blank" rel="noopener noreferrer">
          <InstagramMark /> See more on Instagram
        </a>
      </section>
    </div>
  );
}
