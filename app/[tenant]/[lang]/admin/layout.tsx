'use client';

import { ReactNode, useEffect, useState } from 'react'; // eslint-disable-line @typescript-eslint/no-unused-vars
import ProtectedRoute from '@/components/ProtectedRoute';
import { TenantSettingsProvider } from '@/contexts/TenantSettingsContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { SubscriptionStatusBar } from '@/components/SubscriptionStatusBar';
import { SubscriptionGuard } from '@/components/SubscriptionGuard';

/**
 * Admin Layout
 *
 * This layout wraps all admin pages and ensures:
 * - Only admin, owner, or manager roles can access
 * - Provides consistent admin page structure
 * - Tenant settings context is available
 * - Subscription context and status bar are available
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <TenantSettingsProvider>
      <SubscriptionProvider>
        <ProtectedRoute requiredRoles={['owner', 'admin', 'manager']}>
          <SubscriptionGuard>
            <SubscriptionStatusBar />
            {children}
          </SubscriptionGuard>
        </ProtectedRoute>
      </SubscriptionProvider>
    </TenantSettingsProvider>
  );
}

