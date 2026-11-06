import type { Metadata, Viewport } from "next";
import { Inter, Oswald } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import AppSplash from "@/components/AppSplash";
import SiteChrome from "@/components/SiteChrome";
import { site } from "@/lib/site";

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: site.title,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  /* "Add to Home Screen" on an iPhone opens the site full screen, like an
     app, rather than as a Safari tab (src/components/AddToHomeScreen.tsx).
     The app keeps its own sign-in, separate from Safari's.
     "black-translucent": no separate strip behind the clock; the page runs
     up under it (the navbar pads itself with safe-area-inset-top), so the
     launch splash fades out as one piece with nothing left to catch up. */
  appleWebApp: { capable: true, title: "Neza Bazi", statusBarStyle: "black-translucent" },
  openGraph: {
    title: site.title,
    description: site.description,
    siteName: site.name,
    type: "website",
  },
};

/* "cover" lets the page reach under the clock and the home bar; env(safe-area-
   inset-*) then says how much room they take (0 in a normal browser tab). */
export const viewport: Viewport = { viewportFit: "cover" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // The splash script in AppSplash.tsx marks <html> before React loads.
      suppressHydrationWarning
      className={`${oswald.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/* Installed app only: a brief logo screen as it opens. */}
        <AppSplash />
        <SiteChrome>
          <Navbar />
        </SiteChrome>
        <main className="flex flex-1 flex-col">{children}</main>
        <SiteChrome>
          <Footer />
        </SiteChrome>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
