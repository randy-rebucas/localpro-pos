import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Browse Stores',
  description: 'Find your 1pos store by name, city or @handle and go straight to its sign-in screen.',
  alternates: { canonical: '/stores' },
  robots: { index: true, follow: true },
};

export default function StoresLayout({ children }: { children: ReactNode }) {
  return children;
}
