import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://1pos.app';
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/stores', '/signup'],
        disallow: ['/api/', '/super-admin/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
