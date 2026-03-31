import type { NextConfig } from "next";

const getAllowedOrigin = (): string => {
  if (process.env.NODE_ENV !== 'production') {
    return 'http://localhost:3000';
  }
  const origin = process.env.ALLOWED_ORIGINS;
  if (!origin) {
    console.warn('WARNING: ALLOWED_ORIGINS is not set. CORS will be restricted to no origin.');
    return '';
  }
  return origin;
};

const nextConfig: NextConfig = {
  // Production optimizations
  compress: true,
  poweredByHeader: false,

  // Optimize large packages for tree-shaking
  experimental: {
    optimizePackageImports: [
      'recharts',
      'exceljs',
      'jspdf',
      '@aws-sdk/client-s3',
      'web-push',
      'lucide-react',
    ],
  },

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24, // 24 hours
  },

  async headers() {
    const allowedOrigin = getAllowedOrigin();

    return [
      {
        // Security headers for all routes
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV !== 'production' ? " 'unsafe-eval'" : ''} https://vercel.live https://*.vercel.live`,
              "style-src 'self' 'unsafe-inline' https://vercel.live",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data: https://vercel.live",
              "connect-src 'self' https://api-m.paypal.com https://api-m.sandbox.paypal.com https://vercel.live https://*.vercel.live wss://*.vercel.live",
              "frame-src https://vercel.live",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
          ...(process.env.NODE_ENV === 'production'
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
            : []),
        ],
      },
      {
        // Service worker headers — no caching, strict CSP
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
      {
        // Cache PWA icons aggressively
        source: '/:icon(icon-.*\\.png)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // CORS for API routes — explicit origin, never wildcard
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: allowedOrigin },
          { key: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization' },
        ],
      },
    ];
  },
};

export default nextConfig;
