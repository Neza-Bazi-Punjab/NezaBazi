import type { Metadata } from "next";
import { Inter, Oswald } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import AppSplash from "@/components/AppSplash";
import SiteChrome from "@/components/SiteChrome";
import { IOS_SPLASH_SCREENS, iosSplashFile, iosSplashMedia } from "@/lib/ios-splash-screens";
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
     startupImage: the bronze launch screen iPhone shows before the page
     arrives, one per screen size (src/lib/ios-splash-screens.ts). */
  appleWebApp: {
    capable: true,
    title: "Neza Bazi",
    statusBarStyle: "default",
    startupImage: IOS_SPLASH_SCREENS.map((screen) => ({
      url: iosSplashFile(screen),
      media: iosSplashMedia(screen),
    })),
  },
  openGraph: {
    title: site.title,
    description: site.description,
    siteName: site.name,
    type: "website",
  },
};

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
