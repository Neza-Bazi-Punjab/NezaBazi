import Link from "next/link";

/* Stylized mark: horse head crossed by a tent-pegging lance with pennant */
export function LogoMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M8 44 40 8"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path d="M40 8l-7.5.8 4.6 4.6L40 8Z" fill="currentColor" />
      <path
        d="M15 41c0-9 2-15 7.5-19.5-1.8-2.8-1.8-5.6-.2-8.3l4.5 4.2 3.5-2 1 4.5c5 2.7 8.2 7.3 9 13.6l-3.6 1.4c-1.6-4.6-4.5-7.6-8.4-8.4 1.4 4.9-.3 9.6-4.3 12.6-1.9 1.4-2.8 2.4-3 5.9H15Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function LogoLockup({
  markClassName = "h-10 w-10",
  invert = false,
}: {
  markClassName?: string;
  invert?: boolean;
}) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark
        className={`${markClassName} ${invert ? "text-cream" : "text-bronze"}`}
      />
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
