import Link from "next/link";
import { ArrowRightIcon } from "./icons";

/* Primary call-to-action link. Three poster-matched variants, plus a subtle
   hover lift and arrow nudge (disabled under prefers-reduced-motion). */
type ButtonLinkProps = {
  href: string;
  children: React.ReactNode;
  variant?: "solid" | "outline" | "light";
  arrow?: boolean;
  className?: string;
};

const variants = {
  solid:
    "bg-bronze text-cream hover:bg-bronze-dark focus-visible:outline-bronze-dark",
  outline:
    "border border-brown/40 text-brown hover:border-bronze hover:text-bronze focus-visible:outline-bronze",
  light:
    "bg-cream text-bronze-deep hover:bg-white focus-visible:outline-cream",
};

export default function ButtonLink({
  href,
  children,
  variant = "solid",
  arrow = true,
  className = "",
}: ButtonLinkProps) {
  const classes = `group inline-flex items-center gap-2.5 rounded-lg px-6 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] transition-[background-color,border-color,color,transform,box-shadow] duration-[var(--dur-base)] ease-[var(--ease-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md ${variants[variant]} ${className}`;
  const content = (
    <>
      {children}
      {arrow && (
        <ArrowRightIcon className="h-4 w-4 transition-transform duration-[var(--dur-base)] ease-[var(--ease-soft)] motion-safe:group-hover:translate-x-1" />
      )}
    </>
  );

  /* A link to another site (the YouTube broadcast) opens in a new tab, so the
     visitor keeps this site open behind it. */
  if (/^https?:\/\//.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
        {content}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }

  return (
    <Link href={href} className={classes}>
      {content}
    </Link>
  );
}
