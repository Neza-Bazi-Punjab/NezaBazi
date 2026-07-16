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
