/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
          domains: ['upload.wikimedia.org', 'commons.wikimedia.org'],
    },
    experimental: {
          serverActions: true,
    },
};

module.exports = nextConfig;
