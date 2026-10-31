"use client";

/* The admin menu, shared by every /admin page (see layout.tsx). Grouped in
   the order of the event: registrations before, check-in and scoring on the
   day, then staff and records. A side column on a laptop; a scrollable row on
   a phone. Every item is its own page, so refresh and Back stay put. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { COLLAPSED_COOKIE } from "./admin-nav-state";

type NavItem = { href: string; label: string };

export const ADMIN_NAV: readonly { group: string | null; items: readonly NavItem[] }[] = [
  { group: null, items: [{ href: "/admin", label: "Overview" }] },
  {
    group: "Registrations",
    items: [
      { href: "/admin/solo", label: "Solo riders" },
      { href: "/admin/teams", label: "Teams" },
      { href: "/admin/paper", label: "Paper entry" },
    ],
  },
  {
    group: "Event day",
    items: [
      { href: "/admin/check-in", label: "Check-in" },
      { href: "/admin/scoring", label: "Scoring" },
    ],
  },
  {
    group: "Staff & records",
    items: [
      { href: "/admin/staff", label: "Staff" },
      { href: "/admin/audit", label: "Audit log" },
    ],
  },
  { group: null, items: [{ href: "/admin/guides", label: "PDF guides" }] },
];

/* /admin is active only on itself; every other item also covers its sub-pages. */
const isActive = (pathname: string, href: string) =>
  href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);

/* Collapsed or not, remembered on this device in a cookie (a per-person
   preference, not shared), which the admin layout reads so the menu is drawn
   collapsed from the start. Collapsing only applies to the side column on a
   laptop; on a phone the menu is a row across the top and always shown. */
const ONE_YEAR = 60 * 60 * 24 * 365;

export default function AdminNav({ initialCollapsed = false }: { initialCollapsed?: boolean }) {
  const pathname = usePathname() ?? "/admin";
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${COLLAPSED_COOKIE}=${next ? "1" : "0"}; path=/admin; max-age=${ONE_YEAR}; samesite=lax`;
  };

  return (
    <nav
      aria-label="Admin"
      className={`border-b border-bronze/20 bg-sand lg:sticky lg:top-0 lg:h-screen lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-r ${collapsed ? "lg:w-14" : "lg:w-60"}`}
    >
      <div
        className={`hidden items-center pt-6 lg:flex ${collapsed ? "justify-center" : "justify-between pl-6 pr-3"}`}
      >
        {!collapsed && (
          <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-brown/60">
            Admin
          </p>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand menu" : "Collapse menu"}
          title={collapsed ? "Expand menu" : "Collapse menu"}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-bronze/25 bg-cream text-bronze-dark transition-colors hover:border-bronze-deep hover:bg-bronze-deep hover:text-cream"
        >
          {/* A side panel with a chevron: pointing in to close, out to open. */}
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[1.15rem] w-[1.15rem]">
            <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2.5" />
              <path d="M9 4v16" />
              <path d={collapsed ? "M13.5 10l2 2-2 2" : "M16 10l-2 2 2 2"} />
            </g>
          </svg>
        </button>
      </div>

      <ul
        className={`flex gap-1 overflow-x-auto px-4 py-3 lg:flex-col lg:gap-0 lg:overflow-visible lg:px-3 lg:py-4 ${collapsed ? "lg:hidden" : ""}`}
      >
        {ADMIN_NAV.map((section, index) => (
          <li key={section.group ?? `item-${index}`} className="flex shrink-0 gap-1 lg:block">
            {section.group && (
              <p className="hidden px-3 pb-1 pt-5 font-display text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-brown/55 lg:block">
                {section.group}
              </p>
            )}
            <ul className="flex gap-1 lg:block lg:space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item.href);

                return (
                  <li key={item.href} className="shrink-0">
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`block whitespace-nowrap rounded-lg px-3 py-2 font-display text-sm font-semibold uppercase tracking-[0.12em] transition-colors ${
                        active
                          ? "bg-bronze-deep text-cream"
                          : "text-bronze-dark hover:bg-cream"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
