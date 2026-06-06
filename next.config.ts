import type { NextConfig } from "next";

/**
 * In development, Next HMR opens `wss://…` while the page may be `https://…`; CSP `connect-src 'self'`
 * is scheme-sensitive, so WebSockets to the same host can still be blocked. Tunnels (ngrok) need explicit hosts.
 */
const CSP_DEV_CONNECT_EXTRAS =
  process.env.NODE_ENV === "production"
    ? ""
    : " ws: wss: https://*.ngrok-free.app wss://*.ngrok-free.app https://*.ngrok.io wss://*.ngrok.io https://*.ngrok.app wss://*.ngrok.app";

const nextConfig: NextConfig = {
  // Production optimizations
  compress: true,
  poweredByHeader: false,
  allowedDevOrigins: ['035c-49-147-112-244.ngrok-free.app'],
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
    remotePatterns: [
      // Allow localhost (development) - handles both /uploads and //uploads
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3000',
      },
      // Allow Cloudinary (tenant file storage) - all subdomains
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: '*.cloudinary.com',
      },
      // Shopify product images (catalog sync / storefront CDN)
      {
        protocol: 'https',
        hostname: 'cdn.shopify.com',
      },
      {
        protocol: 'https',
        hostname: '*.shopifycdn.com',
      },
      // Facebook / Instagram CDN (tenant logos, social profile images)
      {
        protocol: 'https',
        hostname: '**.fbcdn.net',
      },
      {
        protocol: 'https',
        hostname: '**.fbsbx.com',
      },
      {
        protocol: 'https',
        hostname: '**.cdninstagram.com',
      },
      // Allow OpenAI DALL-E images
      {
        protocol: 'https',
        hostname: '*.blob.core.windows.net',
      },
      // Allow external CDN/image hosts
      {
        protocol: 'https',
        hostname: '*.example.com',
      },
    ],
  },

  async headers() {
    return [
      {
        // Security headers for all routes
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'microphone=(), geolocation=(self)' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV !== 'production' ? " 'unsafe-eval'" : ''} https://vercel.live https://*.vercel.live https://*.live`,
              "style-src 'self' 'unsafe-inline' https://vercel.live https://*.vercel.live https://*.live",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data: https://vercel.live https://*.vercel.live https://*.live",
              `connect-src 'self' https://api-m.paypal.com https://api-m.sandbox.paypal.com https://vercel.live https://*.vercel.live https://*.live wss://vercel.live wss://*.vercel.live wss://*.live https://res.cloudinary.com https://api.cloudinary.com https://*.cloudinary.com${CSP_DEV_CONNECT_EXTRAS}`,
              "frame-src https://vercel.live https://*.vercel.live https://*.live",
              "worker-src 'self'",
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
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self'",
              process.env.NODE_ENV !== 'production'
                ? `connect-src 'self' https://vercel.live https://*.vercel.live wss://vercel.live wss://*.vercel.live https://res.cloudinary.com https://api.cloudinary.com https://*.cloudinary.com${CSP_DEV_CONNECT_EXTRAS}`
                : "connect-src 'self' https://res.cloudinary.com https://api.cloudinary.com https://*.cloudinary.com",
            ].join('; '),
          },
        ],
      },
      {
        // Cache PWA icons aggressively
        source: '/:icon(icon-.*\\.png)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // CORS for `/api/*` is set in root `proxy.ts` (per-request origin from ALLOWED_ORIGINS list).
    ];
  },
};

export default nextConfig;
