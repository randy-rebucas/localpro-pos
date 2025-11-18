'use client';

import { usePathname } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';

/**
 * This component protects all routes except login
 * For settings page, we also check for admin/manager role
 */
export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname?.includes('/login');
  const isSettingsPage = pathname?.includes('/settings');

  // Don't protect the login page
  if (isLoginPage) {
    return <>{children}</>;
  }

  // Settings page requires admin/manager role
  if (isSettingsPage) {
    return <ProtectedRoute requiredRoles={['admin', 'manager']}>{children}</ProtectedRoute>;
  }

  // Protect all other routes (require authentication only)
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

