'use client';

import { ReactNode } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { TenantSettingsProvider } from '@/contexts/TenantSettingsContext';

/**
 * Admin Layout
 * 
 * This layout wraps all admin pages and ensures:
 * - Only admin, owner, or manager roles can access
 * - Provides consistent admin page structure
 * - Tenant settings context is available
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <TenantSettingsProvider>
      <ProtectedRoute requiredRoles={['owner', 'admin', 'manager']}>
        {children}
      </ProtectedRoute>
    </TenantSettingsProvider>
  );
}

