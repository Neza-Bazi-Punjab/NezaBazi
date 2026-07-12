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
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
