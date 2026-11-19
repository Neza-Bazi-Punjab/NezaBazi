export const site = {
  name: "Neza Bazi Punjab",
  title: "Neza Bazi Punjab Championship 2026",
  description:
    "The Neza Bazi Punjab Championship 2026 — the 1st open tent-pegging championship. 150+ riders compete for the Amritsar Cup on November 11, 2026 in Amritsar, Punjab. Broadcast live.",
  url: "https://www.nezabazipunjab.com",
  eventDate: "November 11, 2026",
  // Riders check in the day before the event and show their confirmation code.
  // Only riders who check in are entered into the brackets. Keep this one day
  // behind eventDate — several pages and the confirmation email describe it as
  // "the day before".
  checkInDate: "November 10, 2026",
  venue: "Amritsar, Punjab",
  cupName: "Amritsar Cup",
  prize: "₹4,00,000",
  riders: "150+",
  email: "nezabaazipunjab@gmail.com",
  instagram: "https://www.instagram.com/nezabazipanjab/",
  socialHandle: "@nezabazipanjab",
  youtube: "https://youtube.com/@nezabazipunjab",
  // The championship's YouTube live broadcast. The "Live Now" buttons that
  // opened it are taken down for now.
  liveStreamUrl: "https://youtube.com/live/XuGGgWDIclw",
  // The full 2026 broadcast, as replayed on the home page (it plays in place
  // from youtube-nocookie.com) and linked from the Champions page.
  replayVideoId: "JoN0OqB5cBU",
  replayUrl: "https://www.youtube.com/live/JoN0OqB5cBU",
  // The rules explainer video (any YouTube URL). The Rulebook page leaves the
  // video out for now (2026 redesign), so nothing reads this at the moment.
  rulesVideoUrl: "" as string,
} as const;

export const navLinks = [
  { href: "/", label: "Home" },
  { href: "/stats", label: "Stats" },
  { href: "/gallery", label: "Gallery" },
  { href: "/event", label: "Event" },
  { href: "/rules", label: "Rulebook" },
] as const;

/* The gold pill at the end of the navbar's tabs. */
export const championsLink = { href: "/champions", label: "2026 Champions" } as const;

export const footerQuickLinks = [
  { href: "/event", label: "Event" },
  { href: "/rules", label: "Rulebook" },
  { href: "/register", label: "Registration" },
  { href: "/stats", label: "Stats" },
  { href: "/login", label: "Login" },
  { href: "/privacy", label: "Privacy Policy" },
] as const;

/* The judges' phone panel, the commentary panel and the stream overlays fill
   the whole screen, so the site navbar and footer are not rendered on them
   (see SiteChrome). Matched per path segment: "/judge" and "/judge/x" are
   chromeless, "/judgement" would not be. */
export const chromelessPathPrefixes = ["/overlay", "/judge", "/commentary"] as const;

export const isChromelessPath = (pathname: string | null | undefined) =>
  typeof pathname === "string" &&
  chromelessPathPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
