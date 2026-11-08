'use client';

import { ReactNode } from 'react';
import { useParams } from 'next/navigation';
import '@/app/marketing.css';
import { marketingFontClasses } from '@/components/marketing/fonts';
import ProtectedRoute from '@/components/ProtectedRoute';
import { SubscriptionGuard } from '@/components/SubscriptionGuard';
import ErrorBoundary from '@/components/ErrorBoundary';
import { AdminLayoutProvider, useAdminLayout } from '@/contexts/AdminLayoutContext';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import { Menu } from 'lucide-react';

function AdminShell({ children }: { children: ReactNode }) {
  const params = useParams();
  const tenant = (params?.tenant as string) || 'default';
  const { settings } = useTenantSettings();
  const { sidebarCollapsed, toggleMobileSidebar, navT } = useAdminLayout();

  const primaryColor = (settings || getDefaultTenantSettings()).primaryColor || '#35979c';
  const businessName = settings?.companyName || tenant;

  return (
    <div className={`${marketingFontClasses} min-h-screen bg-paper flex flex-col`}>
      {/* Phones only: the one way to open the menu drawer. From lg up the sidebar carries the brand. */}
      <div className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center gap-2 border-b-2 border-[#8fe3d0]/60 bg-ink px-2 font-body text-paper lg:hidden">
        <button
          onClick={toggleMobileSidebar}
          className="flex items-center justify-center text-paper/70 hover:bg-white/10 hover:text-paper-white focus-visible:outline-2 focus-visible:outline-[#8fe3d0]"
          aria-label={navT('openMenu', 'Open menu')}
        >
          <Menu className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </button>
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center font-display text-lg font-extrabold uppercase leading-none text-white"
          style={{ backgroundColor: primaryColor }}
        >
          {businessName.charAt(0).toUpperCase()}
        </div>
        <p className="min-w-0 truncate font-display text-xl font-extrabold uppercase leading-none text-paper-white">
          {businessName}
        </p>
      </div>

      <AdminSidebar />

      <main className={`min-w-0 flex-1 pt-14 transition-all duration-200 lg:pt-0 ${sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64'}`}>
        {children}
      </main>
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  // TenantSettingsProvider comes from the parent [lang] layout (layout-protected),
  // seeded with server-loaded settings — no nested provider / second fetch here.
  return (
    <ProtectedRoute requiredRoles={['owner', 'admin', 'manager']}>
      <SubscriptionGuard>
        <ErrorBoundary>
          <AdminLayoutProvider>
            <AdminShell>
              {children}
            </AdminShell>
          </AdminLayoutProvider>
        </ErrorBoundary>
      </SubscriptionGuard>
    </ProtectedRoute>
  );
}
