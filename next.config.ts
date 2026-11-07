import type { NextConfig } from "next";

const securityHeaders = [
  // Block the site (including /admin) from being embedded in iframes.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // Prevent MIME-type sniffing of responses.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send only the origin cross-site, full URL on same-origin navigation.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // This site never needs these browser features.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
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
      // Admin pages may use this site's own camera, for taking a rider's
      // photo from the Solo riders list. Every other page keeps it off. Comes
      // after the catch-all so it overrides that rule's Permissions-Policy.
      {
        source: "/admin/:path*",
        headers: [{ key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" }],
      },
    ];
  },
};

export default nextConfig;
