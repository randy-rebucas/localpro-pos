import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://www.1pos.solutions';
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/stores', '/signup', '/pricing', '/about', '/contact'],
        disallow: ['/api/', '/super-admin/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
