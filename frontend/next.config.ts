import type { NextConfig } from "next";

const targetPlatform = process.env.NEXT_PUBLIC_PLATFORM || 'web';
const baseResolveExtensions = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'];
const platformResolveExtensions =
  targetPlatform === 'ios'
    ? ['.ios.tsx', '.ios.ts', '.ios.jsx', '.ios.js', ...baseResolveExtensions]
    : targetPlatform === 'android'
    ? ['.android.tsx', '.android.ts', '.android.jsx', '.android.js', ...baseResolveExtensions]
    : ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', ...baseResolveExtensions];

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    '172.28.224.1',
    '192.168.88.168',
  ],
  turbopack: {
    resolveExtensions: platformResolveExtensions,
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.extensions = platformResolveExtensions;
    return config;
  },
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
