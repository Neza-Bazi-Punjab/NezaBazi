export const site = {
  name: "Neza Bazi Punjab",
  shortName: "NBP",
  title: "Neza Bazi Punjab Championship 2026",
  tagline: "Tradition. Courage. Glory.",
  description:
    "The Neza Bazi Punjab Championship 2026 — the 1st open tent-pegging championship in Gurdaspur, Punjab on August 21, 2026, with international participation.",
  // Placeholder domain from the poster; update when the real domain is registered.
  url: "https://www.nbp.com",
  eventDate: "August 21, 2026",
  venue: "Gurdaspur, Punjab",
  email: "info@nbp.com",
} as const;

export const navLinks = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/event", label: "Event" },
  { href: "/gallery", label: "Gallery" },
  { href: "/rules", label: "Rules" },
  { href: "/contact", label: "Contact" },
] as const;

export const footerQuickLinks = [
  { href: "/about", label: "About" },
  { href: "/rules", label: "Rules" },
  { href: "/gallery", label: "Gallery" },
  { href: "/contact", label: "Contact" },
  { href: "/players", label: "Players" },
  { href: "/rankings", label: "Rankings" },
] as const;
