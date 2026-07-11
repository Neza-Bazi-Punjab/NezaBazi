export const site = {
  name: "Neza Bazi Punjab",
  shortName: "NBP",
  title: "Neza Bazi Punjab Championship 2026",
  tagline: "Gurdaspur, Punjab",
  description:
    "The Neza Bazi Punjab Championship 2026 — the 1st open tent-pegging championship. Compete for the Gurdaspur Cup on August 21, 2026 in Gurdaspur, Punjab, with international participation.",
  // Placeholder domain from the poster; update when the real domain is registered.
  url: "https://www.nbp.com",
  eventDate: "August 21, 2026",
  venue: "Gurdaspur, Punjab",
  cupName: "Gurdaspur Cup",
  prize: "₹1,00,000",
  email: "nezabazipunjab@gmail.com",
  phone: "+91 568943893",
  instagram: "https://www.instagram.com/nezabazipunjab",
  socialHandle: "@nezabazipunjab",
} as const;

export const sponsors = [
  "Misl Shaheedan Tarna Dal",
  "Dera Misl",
  "Jangi Horse Club UK",
  "Jangi Horse Club Italy",
] as const;

export const navLinks = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/event", label: "Event" },
  // { href: "/gallery", label: "Gallery" }, temporarily not needed
  { href: "/rules", label: "Rules" },
  { href: "/contact", label: "Contact" },
] as const;

export const footerQuickLinks = [
  { href: "/about", label: "About" },
  { href: "/rules", label: "Rules" },
  // { href: "/gallery", label: "Gallery" }, temporarily not needed
  { href: "/contact", label: "Contact" },
  { href: "/players", label: "Players" },
  { href: "/rankings", label: "Rankings" },
] as const;
