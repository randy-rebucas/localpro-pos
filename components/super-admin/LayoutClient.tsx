'use client';

import { usePathname } from 'next/navigation';
import { SuperAdminShell } from '@/components/super-admin/Shell';

export function SuperAdminLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === '/super-admin/login') {
    return <>{children}</>;
  }

  return <SuperAdminShell>{children}</SuperAdminShell>;
}
