/** @type {import('next').NextConfig} */

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "connect-src 'self' https://graph.facebook.com https://auto-ppp-tv.euginemicah.workers.dev",
      "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
    ].join("; "),
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  images: {
    domains: [
      "upload.wikimedia.org", "commons.wikimedia.org", "ppptv-v2.vercel.app",
      "ichef.bbci.co.uk", "www.standardmedia.co.ke", "deadline.com",
      "variety.com", "cdn.standardmedia.co.ke", "www.kenyans.co.ke",
      "naibuzz.com", "notjustok.com", "static01.nyt.com",
    ],
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "img.youtube.com" },
      { protocol: "https", hostname: "**.r2.dev" },
      { protocol: "https", hostname: "pub-*.r2.dev" },
    ],
  },
  // serverActions is on by default in Next.js 14 — no config needed
  webpack: (config, { isServer }) => {
    if (isServer) {
      const existing = Array.isArray(config.externals) ? config.externals : [];
      config.externals = [...existing, "axios", "undici", "cheerio", "agent-twitter-client"];
    }
    return config;
  },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

// build: 2026-04-01
module.exports = nextConfig;
