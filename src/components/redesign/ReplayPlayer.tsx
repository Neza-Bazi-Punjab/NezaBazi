"use client";

import Image from "next/image";
import { useState } from "react";
import h from "@/app/home.module.css";
import type { Photo } from "@/lib/photos-2026";
import { site } from "@/lib/site";

/* The full broadcast on the home page: a poster with a play button that
   swaps itself for the YouTube player (youtube-nocookie.com, so nothing from
   YouTube loads until someone presses play). */
export default function ReplayPlayer({ poster }: { poster: Photo }) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div className={h.player}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${site.replayVideoId}?autoplay=1`}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          title="Neza Bazi Punjab Championship 2026 replay"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      className={h.player}
      onClick={() => setPlaying(true)}
      aria-label="Play the Neza Bazi Punjab Championship 2026 live replay"
    >
      <Image src={poster.src} alt="" fill sizes="(max-width: 1120px) 100vw, 1080px" />
      <span className={h.play}>
        <span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </span>
      <span className={h.cap}>Neza Bazi Punjab Championship 2026 · Live replay</span>
    </button>
  );
}
