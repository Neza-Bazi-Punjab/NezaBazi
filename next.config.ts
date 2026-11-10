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

const nextConfig: NextConfig = {
  // `npm run dev` only: let a phone on the same Wi-Fi open the dev server by
  // the computer's local address (e.g. http://192.168.1.20:3000) to try
  // phone-only features such as the camera. Ignored by production builds.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  async redirects() {
    return [
      // The About page became the Event page.
      { source: "/about", destination: "/event", permanent: true },
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
