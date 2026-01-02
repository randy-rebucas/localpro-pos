'use client';

import { usePathname } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { TenantSettingsProvider } from '@/contexts/TenantSettingsContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import TenantAccessGuard from '@/components/TenantAccessGuard';

/**
 * This component protects all routes except login
 * For settings page, we also check for admin/manager role
 * Also includes tenant access guard to prevent cross-tenant access
 */
export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname?.includes('/login');
  const isForbiddenPage = pathname?.includes('/forbidden');
  const isSettingsPage = pathname?.includes('/settings');

  // Don't protect the login or forbidden pages
  if (isLoginPage || isForbiddenPage) {
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
          <TenantAccessGuard>
            <ProtectedRoute requiredRoles={['admin', 'manager']}>{children}</ProtectedRoute>
          </TenantAccessGuard>
        </TenantSettingsProvider>
      </ErrorBoundary>
    );
  }

  // Protect all other routes (require authentication + tenant access check)
  return (
    <ErrorBoundary>
      <TenantSettingsProvider>
        <TenantAccessGuard>
          <ProtectedRoute>{children}</ProtectedRoute>
        </TenantAccessGuard>
      </TenantSettingsProvider>
    </ErrorBoundary>
  );
}

