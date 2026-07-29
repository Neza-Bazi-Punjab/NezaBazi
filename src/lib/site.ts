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
  prize: "₹3,45,000",
  riders: "150+",
  email: "nezabaazipunjab@gmail.com",
  instagram: "https://www.instagram.com/nezabazipunjab",
  socialHandle: "@nezabazipunjab",
  // TODO: replace with the real channel URL once it exists.
  youtube: "#" as string,
  // TODO: set to the rules explainer video (any YouTube URL). While empty,
  // the Rulebook page shows a "video coming soon" note instead of the player.
  rulesVideoUrl: "" as string,
} as const;

export const navLinks = [
  { href: "/", label: "Home" },
  { href: "/event", label: "Event" },
  { href: "/rules", label: "Rulebook" },
] as const;

export const footerQuickLinks = [
  { href: "/event", label: "Event" },
  { href: "/rules", label: "Rulebook" },
  { href: "/register", label: "Registration" },
  { href: "/login", label: "Login" },
] as const;
