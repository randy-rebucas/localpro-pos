'use client';

import { usePathname } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { TenantSettingsProvider } from '@/contexts/TenantSettingsContext';
import ErrorBoundary from '@/components/ErrorBoundary';

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
    return (
      <ErrorBoundary>
        <TenantSettingsProvider>{children}</TenantSettingsProvider>
      </ErrorBoundary>
    );
  }

  // Settings page requires admin/manager role
  if (isSettingsPage) {
    return (
      <ErrorBoundary>
        <TenantSettingsProvider>
          <ProtectedRoute requiredRoles={['admin', 'manager']}>{children}</ProtectedRoute>
        </TenantSettingsProvider>
      </ErrorBoundary>
    );
  }

  // Protect all other routes (require authentication only)
  return (
    <ErrorBoundary>
      <TenantSettingsProvider>
        <ProtectedRoute>{children}</ProtectedRoute>
      </TenantSettingsProvider>
    </ErrorBoundary>
  );
}

