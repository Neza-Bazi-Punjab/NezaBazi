import Link from "next/link";
import { footerQuickLinks, site, sponsors } from "@/lib/site";
import Logo from "./Logo";
import {
  CalendarIcon,
  FacebookIcon,
  InstagramIcon,
  MapPinIcon,
  UsersIcon,
  YoutubeIcon,
} from "./icons";

const socials = [
  { name: "Facebook", href: "#", icon: FacebookIcon },
  { name: "Instagram", href: site.instagram, icon: InstagramIcon },
  { name: "YouTube", href: "#", icon: YoutubeIcon },
];

/* Site footer: logo blurb, quick links, event info and social links */
export default function Footer() {
  return (
    <footer className="bg-bronze-deep text-cream">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo invert />
          <p className="mt-4 text-sm leading-6 text-cream/75">
            The 1st Open Neza Bazi Punjab Championship — riders competing for
            the {site.cupName}.
          </p>
        </div>

        <nav aria-label="Quick links">
          <h3 className="font-display text-sm font-bold uppercase tracking-[0.25em]">
            Quick Links
          </h3>
          <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm text-cream/80">
            {footerQuickLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-cream">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h3 className="font-display text-sm font-bold uppercase tracking-[0.25em]">
            Event Info
          </h3>
          <ul className="mt-4 space-y-2.5 text-sm text-cream/80">
            <li className="flex items-center gap-2.5">
              <CalendarIcon className="h-4 w-4 shrink-0" /> {site.eventDate}
            </li>
            <li className="flex items-center gap-2.5">
              <MapPinIcon className="h-4 w-4 shrink-0" /> {site.venue}
            </li>
            <li className="flex items-center gap-2.5">
              <UsersIcon className="h-4 w-4 shrink-0" /> International
              Participation
            </li>
          </ul>
        </div>

        <div>
          <h3 className="font-display text-sm font-bold uppercase tracking-[0.25em]">
            Follow Us
          </h3>
          <ul className="mt-4 flex gap-3">
            {socials.map(({ name, href, icon: Icon }) => (
              <li key={name}>
                <a
                  href={href}
                  aria-label={name}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-cream/30 text-cream/85 transition-colors hover:border-cream hover:text-cream"
                >
                  <Icon className="h-4.5 w-4.5" />
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs tracking-[0.15em] text-cream/60">
            {site.socialHandle}
          </p>
        </div>
      </div>

      <div className="border-t border-cream/15 px-6 py-4 text-center text-xs text-cream/60">
        <p className="uppercase tracking-[0.15em]">
          Powered by {sponsors.join(" · ")}
        </p>
        <p className="mt-2">© 2026 Neza Bazi Punjab. All Rights Reserved.</p>
      </div>
    </footer>
  );
}
