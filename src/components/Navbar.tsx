"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isProfileRole, type ProfileRole } from "@/lib/scoring/types";
import { createClient } from "@/lib/supabase/client";
import { championsLink, navLinks } from "@/lib/site";
import { NavLogo } from "./Logo";
import { CloseIcon, MenuIcon } from "./icons";

const getUserLabel = ({
  email,
  user_metadata,
}: {
  email?: string;
  user_metadata?: { full_name?: string };
}) => user_metadata?.full_name ?? email ?? "Player";

/* The staff panels each role can open. They sit among the account items
   (beside My Account), never as tabs: the public tabs stay Home, Stats,
   Gallery, Event and Rulebook. Administrators can open every panel; players see nothing extra.
   The panels check the role again server-side, so this is only a shortcut. */
const staffLinksByRole: Record<ProfileRole, readonly { href: string; label: string }[]> = {
  player: [],
  judge: [{ href: "/judge", label: "Judge Panel" }],
  commentator: [{ href: "/commentary", label: "Commentary" }],
  admin: [
    { href: "/admin", label: "Admin" },
    { href: "/judge", label: "Judge Panel" },
    { href: "/commentary", label: "Commentary" },
  ],
};

/* The Judge Panel and Commentary links are taken off the navbar for now;
   only Admin shows. The pages are unchanged and still open at /judge and
   /commentary. Add them back here to show the links again. */
const SHOWN_STAFF_LINKS: ReadonlySet<string> = new Set(["/admin"]);

/* Sticky top navigation, in the 2026 redesign's look (dark brown, like the
   footer; Cinzel logo, DM Sans tabs in cream, the active tab gold, the gold
   "2026 Champions" pill), the same on every page. The account items (staff
   links, My Account, Log Out or Log In) follow the pill on desktop; on
   phones and tablets the tabs and account items sit in a dropdown that
   smoothly expands and collapses (kept mounted so both directions animate). */
export default function Navbar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userLabel, setUserLabel] = useState<string | null>(null);
  const [role, setRole] = useState<ProfileRole>("player");
  const [authLoading, setAuthLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [supabase] = useState(() => createClient());
  const pathname = usePathname();

  /* Only a signed-in person ever sees staff links, even for the moment
     between signing out and the role being cleared. Only the links in
     SHOWN_STAFF_LINKS (Admin, for now) are shown. */
  const staffLinks = userLabel
    ? staffLinksByRole[role].filter((link) => SHOWN_STAFF_LINKS.has(link.href))
    : [];
  /* An administrator's staff links, My Account and Log Out make a crowded
     row beside the five tabs, so their tabs stay close together. */
  const crowded = staffLinks.length > 1;

  /* Shared styling for mobile menu rows so nav links, auth links and the
     user/logout rows all read as one consistent list with equal tap areas. */
  const mobileRowClass =
    "block border-b border-cream/10 py-3 text-[15px] font-medium transition-colors hover:text-navgold";
  const mobileItemClass =
    "transition-[opacity,transform] duration-[var(--dur-base)] ease-[var(--ease-soft)] motion-reduce:transition-none";
  const mobileItemStyle = (index: number): React.CSSProperties => ({
    transitionDelay: open ? `${index * 40}ms` : "0ms",
    opacity: open ? 1 : 0,
    transform: open ? "none" : "translateY(-6px)",
  });
  /* Mobile rows after the public tabs: the staff links, then the two account
     rows (My Account and Log Out, or Log In and Sign Up). */
  const accountRowIndex = navLinks.length + staffLinks.length;

  const handleLogout = async () => {
    setLoggingOut(true);
    setOpen(false);
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
    setLoggingOut(false);
  };

  useEffect(() => {
    let mounted = true;
    /* Whose role is loaded (or loading), so the getUser result and the
       initial auth event do not both query it, and a late answer for a
       previous user is dropped. */
    let roleUserId: string | null = null;

    /* Reads the signed-in user's own `profiles.role` (RLS lets a user select
       their own row). Anything that is not a known role counts as "player".
       Never awaited by the render path, so the navbar shows straight away and
       the staff links appear once the answer arrives. */
    const loadRole = async (userId: string | null) => {
      if (!mounted || userId === roleUserId) {
        return;
      }

      roleUserId = userId;

      if (!userId) {
        setRole("player");
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();

      if (!mounted || roleUserId !== userId) {
        return;
      }

      if (error) {
        // Let the next auth event try again.
        roleUserId = null;
      }

      setRole(isProfileRole(profile?.role) ? profile.role : "player");
    };

    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) {
        return;
      }

      setUserLabel(user ? getUserLabel(user) : null);
      setAuthLoading(false);
      void loadRole(user?.id ?? null);
    };

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserLabel(session?.user ? getUserLabel(session.user) : null);
      setAuthLoading(false);

      /* Calling Supabase from inside this callback can deadlock the auth
         client, so the role lookup runs once the callback has returned. */
      const userId = session?.user.id ?? null;
      setTimeout(() => {
        void loadRole(userId);
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const onChampions = pathname === championsLink.href;
  /* Account items on desktop: quiet small text after the gold pill. */
  const accountClass =
    "whitespace-nowrap text-[13px] font-medium text-cream/75 transition-colors hover:text-navgold";

  return (
    <header className="sticky top-0 z-50 border-b border-black/30 bg-nav pt-[env(safe-area-inset-top)] font-dmsans">
      <nav
        aria-label="Main"
        className="flex h-16 items-center gap-3 px-4 sm:gap-4 sm:px-6 xl:gap-7 xl:px-10"
      >
        <NavLogo />

        <ul className={`ml-auto hidden items-center gap-5 lg:flex ${crowded ? "" : "xl:gap-6"}`}>
          {navLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  data-active={active}
                  aria-current={active ? "page" : undefined}
                  className={`whitespace-nowrap text-sm font-medium transition-colors hover:text-navgold ${
                    active ? "text-navgold" : "text-cream"
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <Link
          href={championsLink.href}
          aria-current={onChampions ? "page" : undefined}
          className="nb-goldpill ml-auto shrink-0 lg:ml-0"
        >
          {championsLink.label}
        </Link>

        <div className="hidden items-center lg:flex">
          {!authLoading &&
            (userLabel ? (
              <div className="flex items-center gap-4">
                {staffLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={accountClass}
                  >
                    {link.label}
                  </Link>
                ))}
                <Link
                  href="/account"
                  className={accountClass}
                >
                  My Account
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className={`${accountClass} disabled:opacity-60`}
                >
                  {loggingOut ? "Logging out..." : "Log Out"}
                </button>
              </div>
            ) : (
              <Link href="/login" className={accountClass}>
                Log In
              </Link>
            ))}
        </div>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className="-m-2 shrink-0 p-2 text-cream transition-colors hover:text-navgold lg:hidden"
        >
          {open ? <CloseIcon className="h-7 w-7" /> : <MenuIcon className="h-7 w-7" />}
        </button>
      </nav>
      {/* Mobile menu: grid-rows 0fr→1fr expands/collapses height smoothly.
          Kept mounted so both open and close animate. */}
      <div
        id="mobile-menu"
        className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-[var(--dur-base)] ease-[var(--ease-soft)] lg:hidden ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <ul
            className={`flex flex-col border-t border-cream/10 bg-nav px-6 py-4 ${
              open ? "" : "pointer-events-none"
            }`}
            aria-hidden={!open}
          >
            {navLinks.map((link, i) => (
              <li key={link.href} className={mobileItemClass} style={mobileItemStyle(i)}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  tabIndex={open ? undefined : -1}
                  className={`${mobileRowClass} ${
                    pathname === link.href ? "text-navgold" : "text-cream"
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            ))}
            {!authLoading &&
              (userLabel ? (
                <>
                  {staffLinks.map((link, i) => (
                    <li
                      key={link.href}
                      className={mobileItemClass}
                      style={mobileItemStyle(navLinks.length + i)}
                    >
                      <Link
                        href={link.href}
                        onClick={() => setOpen(false)}
                        tabIndex={open ? undefined : -1}
                        className={`${mobileRowClass} text-cream/80`}
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                  <li
                    className={mobileItemClass}
                    style={mobileItemStyle(accountRowIndex)}
                  >
                    <Link
                      href="/account"
                      onClick={() => setOpen(false)}
                      tabIndex={open ? undefined : -1}
                      className={`${mobileRowClass} text-cream/80`}
                    >
                      My Account
                    </Link>
                  </li>
                  <li
                    className={mobileItemClass}
                    style={mobileItemStyle(accountRowIndex + 1)}
                  >
                    <button
                      type="button"
                      onClick={handleLogout}
                      disabled={loggingOut}
                      tabIndex={open ? undefined : -1}
                      className={`${mobileRowClass} w-full text-left text-cream disabled:opacity-60`}
                    >
                      {loggingOut ? "Logging out..." : "Log Out"}
                    </button>
                  </li>
                </>
              ) : (
                <li
                  className={mobileItemClass}
                  style={mobileItemStyle(accountRowIndex)}
                >
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    tabIndex={open ? undefined : -1}
                    className={`${mobileRowClass} ${
                      pathname === "/login" ? "text-navgold" : "text-cream"
                    }`}
                  >
                    Log In
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      </div>
    </header>
  );
}
