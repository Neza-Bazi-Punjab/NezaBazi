"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import h from "@/app/home.module.css";
import type { Photo } from "@/lib/photos-2026";
import { ChevronMark } from "./marks";
import s from "./shared.module.css";

/* The home page's sideways photo strip: a heading with "View the gallery"
   and ← → buttons, and a row of photos that scrolls sideways (swipe, the
   buttons, or drag with a mouse). Each photo keeps its own shape. */
export default function PhotoStrip({ photos }: { photos: Photo[] }) {
  const rail = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    let down = false;
    let startX = 0;
    let startLeft = 0;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      down = true;
      startX = e.clientX;
      startLeft = el.scrollLeft;
      setDragging(true);
    };
    const onMove = (e: PointerEvent) => {
      if (down) el.scrollLeft = startLeft - (e.clientX - startX);
    };
    const onUp = () => {
      down = false;
      setDragging(false);
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const scrollBy = (dir: number) => {
    const el = rail.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: "smooth" });
  };

  return (
    <>
      <div className={`${s.wrap} ${h.stripHead}`}>
        <div>
          <h2 className={s.h2}>Amritsar 2026</h2>
        </div>
        <div className={h.arrows}>
          <Link className={`${s.btn} ${s.outline}`} href="/gallery">
            View the gallery
          </Link>
          <button type="button" aria-label="Previous" onClick={() => scrollBy(-1)}>
            <ChevronMark dir="left" />
          </button>
          <button type="button" aria-label="Next" onClick={() => scrollBy(1)}>
            <ChevronMark dir="right" />
          </button>
        </div>
      </div>
      <div ref={rail} className={`${h.rail} ${dragging ? h.drag : ""}`}>
        {photos.map((p) => (
          <figure key={p.src} style={{ aspectRatio: `${p.width} / ${p.height}` }}>
            <Image
              src={p.src}
              alt={p.alt}
              fill
              draggable={false}
              sizes="(max-width: 820px) 400px, 560px"
            />
          </figure>
        ))}
        <div className={h.railPad} />
      </div>
    </>
  );
}
