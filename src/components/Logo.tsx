import Image from "next/image";
import Link from "next/link";

/* Site logo: the rider-and-lance mark, a mark+wordmark lockup, and the default
   home-linked logo used in the navbar and footer. */

/* Rider-and-lance mark, cropped from public/brand/logo.svg (see public/brand/README.md) */
export function LogoMark({ className = "h-10 w-auto" }: { className?: string }) {
  return (
    <Image
      src="/brand/logo-mark.svg"
      alt=""
      width={886}
      height={722}
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

export default function Logo({ invert = false }: { invert?: boolean }) {
  return (
    <Link href="/" aria-label="Neza Bazi Punjab — home">
      <LogoLockup invert={invert} />
    </Link>
  );
}
