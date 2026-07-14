export const site = {
  name: "Neza Bazi Punjab",
  title: "Neza Bazi Punjab Championship 2026",
  description:
    "The Neza Bazi Punjab Championship 2026 — the 1st open tent-pegging championship. Compete for the Gurdaspur Cup on August 21, 2026 in Gurdaspur, Punjab, with international participation.",
  url: "https://www.nezabazipunjab.com",
  eventDate: "August 21, 2026",
  venue: "Gurdaspur, Punjab",
  cupName: "Gurdaspur Cup",
  prize: "₹1,00,000",
  email: "nezabazipunjab@gmail.com",
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
  { href: "/about", label: "About" },
  { href: "/rules", label: "Rulebook" },
] as const;

export const footerQuickLinks = [
  { href: "/about", label: "About" },
  { href: "/rules", label: "Rulebook" },
  { href: "/register", label: "Registration" },
  { href: "/login", label: "Login" },
] as const;
