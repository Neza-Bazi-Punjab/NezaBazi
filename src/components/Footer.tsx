import Link from "next/link";
import { footerQuickLinks, site } from "@/lib/site";
import Logo from "./Logo";
import { InstagramIcon, MailIcon, YoutubeIcon } from "./icons";

/* Site footer: the logo, the site's pages and the contact channels, in three
   columns. No event details here: the site will carry more events. */
export default function Footer() {
  return (
    <footer className="bg-nav text-cream">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 sm:grid-cols-3">
        <div className="flex items-center justify-center">
          <Logo invert />
        </div>

        <nav aria-label="Navigation">
          <h3 className="font-display text-sm font-bold uppercase tracking-[0.25em]">
            Navigation
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
                target="_blank"
                rel="noopener noreferrer"
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
