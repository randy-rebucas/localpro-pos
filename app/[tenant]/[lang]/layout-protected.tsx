'use client';

import { usePathname } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { TenantSettingsProvider } from '@/contexts/TenantSettingsContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import TenantAccessGuard from '@/components/TenantAccessGuard';
import type { ITenantSettings } from '@/types/tenant';

/**
 * This component protects all routes except login
 * For settings page, we also check for admin/manager role
 * Also includes tenant access guard to prevent cross-tenant access
 *
 * The provider tree is kept structurally identical across pathnames
 * (ErrorBoundary > TenantSettingsProvider > ...) so client-side navigation
 * between login, /settings and other pages doesn't remount the providers and
 * refetch their data.
 */
export default function ProtectedLayout({
  children,
  initialSettings,
}: {
  children: React.ReactNode;
  initialSettings?: Partial<ITenantSettings> | null;
}) {
  const pathname = usePathname();
  const isLoginPage = pathname?.includes('/login');
  const isForbiddenPage = pathname?.includes('/forbidden');
  const isSettingsPage = pathname?.includes('/settings');

  return (
    <ErrorBoundary>
      <TenantSettingsProvider initialSettings={initialSettings}>
        {isLoginPage || isForbiddenPage ? (
          // Don't protect the login or forbidden pages
          children
        ) : (
          <SubscriptionProvider>
            <TenantAccessGuard>
              {/* Settings page requires admin/manager role */}
              <ProtectedRoute requiredRoles={isSettingsPage ? ['admin', 'manager'] : undefined}>
                {children}
              </ProtectedRoute>
            </TenantAccessGuard>
          </SubscriptionProvider>
        )}
      </TenantSettingsProvider>
    </ErrorBoundary>
  );
}
