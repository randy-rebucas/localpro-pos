import type { Metadata } from 'next';
import { SuperAdminLayoutClient } from '@/components/super-admin/LayoutClient';

export const metadata: Metadata = {
  title: 'Super Admin — 1pos',
  description: 'Super Admin Management Panel',
};

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return <SuperAdminLayoutClient>{children}</SuperAdminLayoutClient>;
}
