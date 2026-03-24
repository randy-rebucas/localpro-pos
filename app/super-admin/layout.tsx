import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Super Admin — 1pos',
  description: 'Super Admin Management Panel',
};

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
