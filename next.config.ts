import type { NextConfig } from "next";

const securityHeaders = [
  // Block the site (including /admin) from being embedded in iframes.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // Prevent MIME-type sniffing of responses.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send only the origin cross-site, full URL on same-origin navigation.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The camera is for this site's own pages only (admins take riders'
  // photos), never for anything embedded from elsewhere. It is allowed on
  // every page, not just /admin: the browser fixes this policy when a page
  // first loads, and moving into /admin by a link keeps the policy of the
  // page the admin started on, which would block the camera. The browser
  // still asks before any page may use it. The rest are never needed.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

/* Every year in SEASONS (src/lib/stats/seasons.ts), as a named group for the
   old ?season= links. src/app/stats/stats-page.test.mts keeps the two in step. */
const STATS_SEASON_PATTERN = "(?<season>2026)";

const nextConfig: NextConfig = {
  // `npm run dev` only: let a phone on the same Wi-Fi open the dev server by
  // the computer's local address (e.g. http://192.168.1.20:3000) to try
  // phone-only features such as the camera. Ignored by production builds.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  async redirects() {
    return [
      // The About page became the Event page.
      { source: "/about", destination: "/event", permanent: true },
      // Stats moved from ?season= and ?view= to paths, so each page can be
      // built at deploy time (src/app/stats/StatsSeason.tsx). Old links land
      // on the same table. STATS_SEASON_PATTERN lists the seasons with a page;
      // any other ?season= falls back to the newest season, as it always did.
      // First match wins, so the season-and-teams rule comes first. Not
      // permanent: browsers would remember a permanent one for good, and these
      // addresses are only days old.
      {
        source: "/stats",
        has: [
          { type: "query", key: "season", value: STATS_SEASON_PATTERN },
          { type: "query", key: "view", value: "teams" },
        ],
        destination: "/stats/:season/teams",
        permanent: false,
      },
      {
        source: "/stats",
        has: [{ type: "query", key: "season", value: STATS_SEASON_PATTERN }],
        destination: "/stats/:season",
        permanent: false,
      },
      {
        source: "/stats",
        has: [{ type: "query", key: "view", value: "teams" }],
        destination: "/stats/teams",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      // Public documents (e.g. the rulebook PDF) must be embeddable by our
      // own pages for inline previews — but still by no one else.
      {
        source: "/documents/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
