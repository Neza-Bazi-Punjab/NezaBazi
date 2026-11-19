import Image from "next/image";
import s from "./shared.module.css";

/* Home page section breaks: the two section colours meet on a gentle wave,
   with a dark-brown calligraphy marker line along it and a thin gold line
   weaving over and under it. Drawn once from the agreed draft
   (handoff/mock-home/swirl.js, seed #3, gold "Thin") and kept as fixed
   artwork in public/images/2026/breaks/home-1.svg … home-4.svg:
   1 hero → champions (clear above, light warm brown below),
   2 champions → photo strip, 3 photo strip → replay,
   4 the closing photo's top edge (light warm brown above, clear below). */
export function SwirlBreak({
  n,
  className = "",
}: {
  n: 1 | 2 | 3 | 4;
  className?: string;
}) {
  return (
    <div className={`${s.sdiv} ${className}`} aria-hidden="true">
      <Image
        src={`/images/2026/breaks/home-${n}.svg`}
        alt=""
        width={1440}
        height={80}
        unoptimized
        priority={n === 1}
      />
    </div>
  );
}

/* Champions and Gallery section breaks ("Hairlines"): the colour change on a
   straight seam, a thin brown line and a thin gold line just below it. */
export function HairlineBreak({ from, to }: { from: string; to: string }) {
  const W = 1440;
  const H = 40;
  const M = H / 2;
  return (
    <div className={`${s.sdiv} ${s.hairline}`} aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <path style={{ fill: from }} d={`M0,-1L0,${M}L${W},${M}L${W},-1Z`} />
        <path style={{ fill: to }} d={`M0,${H + 1}L0,${M}L${W},${M}L${W},${H + 1}Z`} />
        <line x1="0" x2={W} y1={M - 3} y2={M - 3} stroke="#5a3517" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <line x1="0" x2={W} y1={M + 2} y2={M + 2} stroke="#c8962e" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
