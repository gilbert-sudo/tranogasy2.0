import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: [
      'react-icons',
      'lucide-react',
      '@vis.gl/react-google-maps',
    ],
    // Client router cache: reuse already-visited pages instead of re-rendering
    // them on the server on every navigation (Next's default for dynamic pages is 0s).
    staleTimes: {
      dynamic: 60, // seconds — e.g. /explore (force-dynamic)
      static: 300, // seconds — static/ISR pages and prefetched routes
    },
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 86400 * 7, // 7 days cache for optimized images
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'via.placeholder.com',
      },
      {
        protocol: 'https',
        hostname: 'ui-avatars.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
};

export default nextConfig;
