/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [
      "upload.wikimedia.org",
      "commons.wikimedia.org",
      "ppptv-v2.vercel.app",
      "ichef.bbci.co.uk",
      "www.standardmedia.co.ke",
      "variety.com",
      "deadline.com",
    ],
  },
  // serverActions is on by default in Next.js 14 — no config needed
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Prevent packages that use modern JS syntax (undici, etc.)
      // from being bundled by webpack — they run fine as Node.js externals
      const existing = Array.isArray(config.externals) ? config.externals : [];
      config.externals = [...existing, "axios", "undici", "cheerio"];
    }
    return config;
  },
};

module.exports = nextConfig;
