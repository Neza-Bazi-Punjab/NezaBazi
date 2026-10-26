"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isProfileRole, type ProfileRole } from "@/lib/scoring/types";
import { createClient } from "@/lib/supabase/client";
import { navLinks } from "@/lib/site";
import Logo from "./Logo";
import { CloseIcon, MenuIcon } from "./icons";

const getUserLabel = ({
  email,
  user_metadata,
}: {
  email?: string;
  user_metadata?: { full_name?: string };
}) => user_metadata?.full_name ?? email ?? "Player";

/* The staff panels each role can open. They sit among the account items
   (beside My Account), never as tabs: the public tabs stay Home, Event and
   Rulebook. Administrators can open every panel; players see nothing extra.
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

/* Sticky top navigation: animated hover/active underlines on desktop and a
   mobile dropdown that smoothly expands and collapses (kept mounted so both
   directions animate). */
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
     between signing out and the role being cleared. */
  const staffLinks = userLabel ? staffLinksByRole[role] : [];
  /* An administrator's three staff links, My Account, Log Out and Register
     Now do not fit in one desktop row until xl (they wrap at 1024px), so
     below xl the Register Now button gives way for administrators only. */
  const crowded = staffLinks.length > 1;

  /* Shared styling for mobile menu rows so nav links, auth links and the
     user/logout rows all read as one consistent list with equal tap areas. */
  const mobileRowClass =
    "block border-b border-bronze/10 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] transition-colors hover:text-bronze";
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

  return (
    <header className="sticky top-0 z-50 border-b border-bronze/15 bg-sand/90 backdrop-blur">
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6"
      >
        <Logo />

        <ul className="hidden items-center gap-7 lg:flex">
          {navLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  data-active={active}
                  aria-current={active ? "page" : undefined}
                  className={`nav-underline font-display text-sm font-semibold uppercase tracking-[0.15em] transition-colors hover:text-bronze ${
                    active ? "text-bronze" : "text-ink"
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="hidden items-center gap-5 lg:flex">
          {!authLoading &&
            (userLabel ? (
              <div className="flex items-center gap-4">
                {staffLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="nav-underline font-display text-sm font-semibold uppercase tracking-[0.15em] text-brown/70 transition-colors hover:text-bronze"
                  >
                    {link.label}
                  </Link>
                ))}
                <Link
                  href="/account"
                  className="nav-underline font-display text-sm font-semibold uppercase tracking-[0.15em] text-brown/70 transition-colors hover:text-bronze"
                >
                  My Account
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="nav-underline font-display text-sm font-semibold uppercase tracking-[0.15em] text-brown/70 transition-colors hover:text-bronze disabled:opacity-60"
                >
                  {loggingOut ? "Logging out..." : "Log Out"}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-5">
                <Link
                  href="/login"
                  className="nav-underline font-display text-sm font-semibold uppercase tracking-[0.15em] text-brown/70 transition-colors hover:text-bronze"
                >
                  Log In
                </Link>
                <Link
                  href="/signup"
                  className="nav-underline font-display text-sm font-semibold uppercase tracking-[0.15em] text-brown/70 transition-colors hover:text-bronze"
                >
                  Sign Up
                </Link>
              </div>
            ))}
          <Link
            href="/register"
            className={`${crowded ? "hidden xl:block " : ""}rounded-full bg-bronze px-6 py-2.5 font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream shadow-sm transition-[background-color,transform,box-shadow] duration-[var(--dur-base)] ease-[var(--ease-soft)] hover:bg-bronze-dark hover:shadow-md motion-safe:hover:-translate-y-0.5`}
          >
            Register Now
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className="-m-2 p-2 text-ink transition-colors hover:text-bronze lg:hidden"
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
            className={`flex flex-col border-t border-bronze/15 bg-sand px-6 py-4 ${
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
                    pathname === link.href ? "text-bronze" : "text-ink"
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
                        className={`${mobileRowClass} text-brown/80`}
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
                      className={`${mobileRowClass} text-brown/80`}
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
                      className={`${mobileRowClass} w-full text-left text-ink disabled:opacity-60`}
                    >
                      {loggingOut ? "Logging out..." : "Log Out"}
                    </button>
                  </li>
                </>
              ) : (
                <>
                  <li
                    className={mobileItemClass}
                    style={mobileItemStyle(accountRowIndex)}
                  >
                    <Link
                      href="/login"
                      onClick={() => setOpen(false)}
                      tabIndex={open ? undefined : -1}
                      className={`${mobileRowClass} ${
                        pathname === "/login" ? "text-bronze" : "text-ink"
                      }`}
                    >
                      Log In
                    </Link>
                  </li>
                  <li
                    className={mobileItemClass}
                    style={mobileItemStyle(accountRowIndex + 1)}
                  >
                    <Link
                      href="/signup"
                      onClick={() => setOpen(false)}
                      tabIndex={open ? undefined : -1}
                      className={`${mobileRowClass} ${
                        pathname === "/signup" ? "text-bronze" : "text-ink"
                      }`}
                    >
                      Sign Up
                    </Link>
                  </li>
                </>
              ))}
            <li
              className={`pt-4 ${mobileItemClass}`}
              style={mobileItemStyle(accountRowIndex + 2)}
            >
              <Link
                href="/register"
                onClick={() => setOpen(false)}
                tabIndex={open ? undefined : -1}
                className="block rounded-full bg-bronze px-6 py-3 text-center font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze-dark"
              >
                Register Now
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </header>
  );
}
