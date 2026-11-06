import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://www.1pos.solutions';
  return [
    { url: base, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${base}/stores`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/signup`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/pricing`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
  ];
}
