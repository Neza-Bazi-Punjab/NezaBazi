"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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

/* Sticky top navigation: animated hover/active underlines on desktop and a
   mobile dropdown that smoothly expands and collapses (kept mounted so both
   directions animate). */
export default function Navbar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userLabel, setUserLabel] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [supabase] = useState(() => createClient());
  const pathname = usePathname();
  const mobileLinks = [...navLinks];

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

    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) {
        return;
      }

      setUserLabel(user ? getUserLabel(user) : null);
      setAuthLoading(false);
    };

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserLabel(session?.user ? getUserLabel(session.user) : null);
      setAuthLoading(false);
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
            className="rounded-full bg-bronze px-6 py-2.5 font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream shadow-sm transition-[background-color,transform,box-shadow] duration-[var(--dur-base)] ease-[var(--ease-soft)] hover:bg-bronze-dark hover:shadow-md motion-safe:hover:-translate-y-0.5"
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
          className="text-ink transition-colors hover:text-bronze lg:hidden"
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
            {mobileLinks.map((link, i) => (
              <li
                key={link.href}
                className="transition-[opacity,transform] duration-[var(--dur-base)] ease-[var(--ease-soft)] motion-reduce:transition-none"
                style={{
                  transitionDelay: open ? `${i * 40}ms` : "0ms",
                  opacity: open ? 1 : 0,
                  transform: open ? "none" : "translateY(-6px)",
                }}
              >
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  tabIndex={open ? undefined : -1}
                  className={`block border-b border-bronze/10 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] transition-colors hover:text-bronze ${
                    pathname === link.href ? "text-bronze" : "text-ink"
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            ))}
            {!authLoading && (
              <li className="border-b border-bronze/10 py-4">
                {userLabel ? (
                  <div className="space-y-3">
                    <Link
                      href="/account"
                      onClick={() => setOpen(false)}
                      tabIndex={open ? undefined : -1}
                      className="block font-display text-sm font-semibold uppercase tracking-[0.15em] text-brown/70 transition-colors hover:text-bronze"
                    >
                      My Account
                    </Link>
                    <button
                      type="button"
                      onClick={handleLogout}
                      disabled={loggingOut}
                      tabIndex={open ? undefined : -1}
                      className="font-display text-sm font-semibold uppercase tracking-[0.15em] text-ink transition-colors hover:text-bronze disabled:opacity-60"
                    >
                      {loggingOut ? "Logging out..." : "Log Out"}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <Link
                      href="/login"
                      onClick={() => setOpen(false)}
                      tabIndex={open ? undefined : -1}
                      className={`font-display text-sm font-semibold uppercase tracking-[0.15em] transition-colors hover:text-bronze ${
                        pathname === "/login" ? "text-bronze" : "text-ink"
                      }`}
                    >
                      Log In
                    </Link>
                    <Link
                      href="/signup"
                      onClick={() => setOpen(false)}
                      tabIndex={open ? undefined : -1}
                      className={`font-display text-sm font-semibold uppercase tracking-[0.15em] transition-colors hover:text-bronze ${
                        pathname === "/signup" ? "text-bronze" : "text-ink"
                      }`}
                    >
                      Sign Up
                    </Link>
                  </div>
                )}
              </li>
            )}
            <li className="pt-4">
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
