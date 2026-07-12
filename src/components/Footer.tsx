import Link from "next/link";
import { footerQuickLinks, site } from "@/lib/site";
import Logo from "./Logo";
import {
  CalendarIcon,
  InstagramIcon,
  MailIcon,
  MapPinIcon,
  TrophyIcon,
  YoutubeIcon,
} from "./icons";

/* Site footer: logo blurb, quick links, event info and contact channels */
export default function Footer() {
  return (
    <footer className="bg-bronze-deep text-cream">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo invert />
          <p className="mt-4 text-sm leading-6 text-cream/75">
            The 1st open Neza Bazi championship: riders competing for the{" "}
            {site.cupName} on {site.eventDate}.
          </p>
        </div>

        <nav aria-label="Quick links">
          <h3 className="font-display text-sm font-bold uppercase tracking-[0.25em]">
            Quick Links
          </h3>
          <ul className="mt-4 space-y-2 text-sm text-cream/80">
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
              <TrophyIcon className="h-4 w-4 shrink-0" /> {site.prize}{" "}
              {site.cupName}
            </li>
          </ul>
        </div>

        <div>
          <h3 className="font-display text-sm font-bold uppercase tracking-[0.25em]">
            Contact
          </h3>
          <ul className="mt-4 space-y-2.5 text-sm text-cream/80">
            <li>
              <a
                href={`mailto:${site.email}`}
                className="flex items-center gap-2.5 hover:text-cream"
              >
                <MailIcon className="h-4 w-4 shrink-0" /> {site.email}
              </a>
            </li>
            <li>
              <a
                href={site.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 hover:text-cream"
              >
                <InstagramIcon className="h-4 w-4 shrink-0" />{" "}
                {site.socialHandle}
              </a>
            </li>
            <li>
              <a
                href={site.youtube}
                className="flex items-center gap-2.5 hover:text-cream"
              >
                <YoutubeIcon className="h-4 w-4 shrink-0" /> YouTube
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-cream/15 px-6 py-4 text-center text-xs text-cream/60">
        <p>© 2026 Neza Bazi Punjab. All Rights Reserved.</p>
      </div>
    </footer>
  );
}
