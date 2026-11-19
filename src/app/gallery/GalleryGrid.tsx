"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { galleryEvener, type Photo } from "@/lib/photos-2026";
import g from "./gallery.module.css";

/* Photos go in reading order, each into the shortest column so far (by the
   photos' own shapes), as in the draft. Worked out for 4, 3 and 2 columns;
   CSS shows the one that fits the screen (4 from 1200 px, 3 from 760 px). */
const layout = (photos: Photo[], n: number, leaveOut?: Photo) => {
  const heights = Array<number>(n).fill(0);
  const cols = Array.from({ length: n }, () => [] as number[]);
  photos.forEach((p, i) => {
    if (p.src === leaveOut?.src) return;
    const c = heights.indexOf(Math.min(...heights));
    cols[c].push(i);
    heights[c] += p.height / p.width + 0.06;
  });
  return cols;
};

const COLUMN_SETS = [
  { n: 4, cls: g.cols4, sizes: "(max-width: 1640px) 25vw, 410px", leaveOut: undefined },
  { n: 3, cls: g.cols3, sizes: "33vw", leaveOut: galleryEvener },
  { n: 2, cls: g.cols2, sizes: "50vw", leaveOut: undefined },
];

/* The masonry grid and its full-screen viewer (arrows, Esc, swipe, a click
   outside the photo closes it). Tiles fade up as they scroll into view. */
export default function GalleryGrid({ photos }: { photos: Photo[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const swipeX = useRef<number | null>(null);

  /* Step through the photos, round from the last to the first and back. */
  const step = useCallback(
    (by: number) =>
      setOpen((i) => (i === null ? i : (i + by + photos.length) % photos.length)),
    [photos.length]
  );

  // Fade each tile up the first time it scrolls into view.
  useEffect(() => {
    const tiles = root.current?.querySelectorAll<HTMLElement>(".reveal");
    if (!tiles?.length) return;
    if (typeof IntersectionObserver === "undefined") {
      tiles.forEach((t) => t.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );
    tiles.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);

  const isOpen = open !== null;
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, step]);

  const current = open === null ? null : photos[open];

  return (
    <>
      <div ref={root}>
        {COLUMN_SETS.map(({ n, cls, sizes, leaveOut }) => (
          <div key={n} className={`${g.masonry} ${cls}`}>
            {layout(photos, n, leaveOut).map((col, ci) => (
              <div key={ci} className={g.col}>
                {col.map((i) => (
                  <button
                    key={i}
                    type="button"
                    className={`${g.tile} reveal`}
                    onClick={() => setOpen(i)}
                    aria-label={`Open photo ${i + 1} of ${photos.length}`}
                  >
                    <Image
                      src={photos[i].src}
                      alt={photos[i].alt}
                      width={photos[i].width}
                      height={photos[i].height}
                      sizes={sizes}
                    />
                  </button>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>

      {current && (
        <div
          className={g.viewer}
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(null);
          }}
          onTouchStart={(e) => {
            swipeX.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            if (swipeX.current === null) return;
            const d = e.changedTouches[0].clientX - swipeX.current;
            if (Math.abs(d) > 50) step(d < 0 ? 1 : -1);
            swipeX.current = null;
          }}
        >
          <button type="button" className={g.x} aria-label="Close" onClick={() => setOpen(null)}>
            ×
          </button>
          <button type="button" className={g.prev} aria-label="Previous" onClick={() => step(-1)}>
            ←
          </button>
          <Image
            key={current.src}
            src={current.src}
            alt={current.alt}
            width={current.width}
            height={current.height}
            sizes="92vw"
            /* As large as fits (92% of the width, 82% of the height), never
               past the photo's own size. Set here because a responsive
               image's natural size depends on which copy the browser picked. */
            style={{
              width: `min(92vw, calc(82vh * ${current.width} / ${current.height}), ${current.width}px)`,
            }}
          />
          <p />
          <button type="button" className={g.next} aria-label="Next" onClick={() => step(1)}>
            →
          </button>
        </div>
      )}
    </>
  );
}
