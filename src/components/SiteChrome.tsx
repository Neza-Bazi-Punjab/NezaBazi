"use client";

import { usePathname } from "next/navigation";
import { isChromelessPath } from "@/lib/site";

/* Renders the site chrome (the navbar, or the footer) it wraps everywhere
   except the full-screen staff panels and stream overlays: /judge,
   /commentary and /overlay (see chromelessPathPrefixes in site.ts). The root
   layout wraps Navbar and Footer separately and passes them in as children,
   so the Footer stays a server component. */
export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isChromelessPath(pathname)) {
    return null;
  }

  return children;
}
