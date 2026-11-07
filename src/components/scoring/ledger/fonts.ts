// The two typefaces of the judges' and commentary panels ("Live Scoring 6e"):
// IBM Plex Sans Condensed for names and numbers, IBM Plex Mono for labels.
// Loaded only by those panels; the public site keeps Oswald and Inter.
import { IBM_Plex_Mono, IBM_Plex_Sans_Condensed } from "next/font/google";

const condensed = IBM_Plex_Sans_Condensed({
  variable: "--font-plex-condensed",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const ledgerFontVariables = `${condensed.variable} ${mono.variable}`;
