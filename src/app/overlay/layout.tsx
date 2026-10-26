import type { Metadata } from "next";
import "./overlay.css";

/* Stream overlays are public (no login: OBS and vMix cannot sign in) but are
   not pages for search engines. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function OverlayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
