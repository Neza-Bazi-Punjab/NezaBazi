import Image from "next/image";
import Link from "next/link";

/* Site logo: the rider-and-lance mark, a mark+wordmark lockup, and the default
   home-linked logo used in the navbar and footer. */

/* NBP hexagon mark, cropped from public/brand/logo.svg (see public/brand/README.md) */
export function LogoMark({ className = "h-10 w-auto" }: { className?: string }) {
  return (
    <Image
      src="/brand/logo-mark.svg"
      alt=""
      width={502}
      height={528}
      unoptimized
      className={className}
    />
  );
}

export function LogoLockup({
  markClassName = "h-10 w-auto",
  invert = false,
}: {
  markClassName?: string;
  invert?: boolean;
}) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark className={markClassName} />
      <span
        className={`font-display leading-none ${invert ? "text-cream" : "text-brown"}`}
      >
        <span className="block text-sm font-bold tracking-[0.2em]">
          NEZA BAZI
        </span>
        <span
          className={`block text-[10px] font-semibold tracking-[0.45em] ${invert ? "text-cream/80" : "text-bronze"}`}
        >
          PUNJAB
        </span>
      </span>
    </span>
  );
}

/* The navbar's logo (2026 redesign): the hexagon mark with the name in
   Cinzel, always stacked: NEZA BAZI over a spaced-out gold PUNJAB.
   The footer keeps the original lockup (Logo below). */
export function NavLogo() {
  return (
    <Link
      href="/"
      aria-label="Neza Bazi Punjab — home"
      className="flex shrink-0 items-center gap-2.5 font-cinzel font-bold text-cream"
    >
      <LogoMark className="h-9 w-auto sm:h-10" />
      <span className="leading-none">
        <span className="block text-[13px] tracking-[0.12em] sm:text-sm">NEZA BAZI</span>
        <span className="mt-0.5 block text-[11px] tracking-[0.42em] text-navgold sm:text-xs">
          PUNJAB
        </span>
      </span>
    </Link>
  );
}

export default function Logo({ invert = false }: { invert?: boolean }) {
  return (
    <Link href="/" aria-label="Neza Bazi Punjab — home">
      <LogoLockup invert={invert} />
    </Link>
  );
}
