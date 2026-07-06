import Link from "next/link";
import { ArrowRightIcon } from "./icons";

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
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2.5 rounded-lg px-6 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${variants[variant]} ${className}`}
    >
      {children}
      {arrow && <ArrowRightIcon className="h-4 w-4" />}
    </Link>
  );
}
