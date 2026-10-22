import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Client router cache: reuse already-visited pages instead of re-rendering
    // them on the server on every navigation (Next's default for dynamic pages is 0s).
    staleTimes: {
      dynamic: 60, // seconds — e.g. /explore (force-dynamic)
      static: 300, // seconds — static/ISR pages and prefetched routes
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'via.placeholder.com',
      },
    ],
  },
};

export default nextConfig;
