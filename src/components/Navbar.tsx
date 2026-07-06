"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { navLinks } from "@/lib/site";
import Logo from "./Logo";
import { CloseIcon, MenuIcon } from "./icons";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-bronze/15 bg-sand/90 backdrop-blur">
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6"
      >
        <Logo />

        <ul className="hidden items-center gap-7 lg:flex">
          {navLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`font-display text-sm font-semibold uppercase tracking-[0.15em] transition-colors hover:text-bronze ${
                  pathname === link.href
                    ? "text-bronze underline decoration-2 underline-offset-8"
                    : "text-ink"
                }`}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-5 lg:flex">
          <Link
            href="/login"
            className="font-display text-sm font-semibold uppercase tracking-[0.15em] text-brown/70 transition-colors hover:text-bronze"
          >
            Login
          </Link>
          <Link
            href="/register"
            className="rounded-full bg-bronze px-6 py-2.5 font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze-dark"
          >
            Register Now
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className="text-ink lg:hidden"
        >
          {open ? <CloseIcon className="h-7 w-7" /> : <MenuIcon className="h-7 w-7" />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-bronze/15 bg-sand lg:hidden">
          <ul className="flex flex-col px-6 py-4">
            {[...navLinks, { href: "/login", label: "Login" }].map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={`block border-b border-bronze/10 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] ${
                    pathname === link.href ? "text-bronze" : "text-ink"
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li className="pt-4">
              <Link
                href="/register"
                onClick={() => setOpen(false)}
                className="block rounded-full bg-bronze px-6 py-3 text-center font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream"
              >
                Register Now
              </Link>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
