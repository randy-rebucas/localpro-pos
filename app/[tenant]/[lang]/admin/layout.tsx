'use client';

import { ReactNode } from 'react';
import { useParams } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { TenantSettingsProvider } from '@/contexts/TenantSettingsContext';
import { SubscriptionGuard } from '@/components/SubscriptionGuard';
import ErrorBoundary from '@/components/ErrorBoundary';
import { AdminLayoutProvider, useAdminLayout } from '@/contexts/AdminLayoutContext';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import { Menu, PanelLeftClose, PanelLeftOpen, Bell } from 'lucide-react';

function AdminShell({ children }: { children: ReactNode }) {
  const params = useParams();
  const tenant = (params?.tenant as string) || 'default';
  const { user } = useAuth();
  const { settings } = useTenantSettings();
  const { sidebarCollapsed, toggleCollapse, toggleMobileSidebar } = useAdminLayout();

  const primaryColor = (settings || getDefaultTenantSettings()).primaryColor || '#35979c';
  const businessName = settings?.companyName || tenant;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top header bar */}
      <header
        className="fixed top-0 left-0 right-0 h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 z-40"
      >
        {/* Left: hamburger (mobile) / collapse (desktop) + brand */}
        <div className="flex items-center gap-3">
          {/* Mobile hamburger */}
          <button
            onClick={toggleMobileSidebar}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          {/* Desktop collapse toggle */}
          <button
            onClick={toggleCollapse}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hidden lg:flex"
            aria-label="Toggle sidebar"
          >
            {sidebarCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
          </button>

          {/* Brand */}
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center text-white text-xs font-bold"
              style={{ backgroundColor: primaryColor }}
            >
              {businessName.charAt(0).toUpperCase()}
            </div>
            <span className="font-semibold text-gray-800 text-sm hidden sm:block truncate max-w-[160px]">
              {businessName}
            </span>
          </div>
        </div>

        {/* Center: breadcrumb / page title area (optional, empty for now) */}
        <div className="hidden md:block" />

        {/* Right: notifications + user chip */}
        <div className="flex items-center gap-2">
          <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 relative" aria-label="Notifications">
            <Bell className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
              style={{ backgroundColor: primaryColor }}
            >
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <span className="text-sm text-gray-700 font-medium hidden sm:block max-w-[120px] truncate">
              {user?.name || 'User'}
            </span>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <AdminSidebar />

      {/* Main content */}
      <main
        className={`flex-1 pt-14 transition-all duration-200 ${
          sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64'
        }`}
      >
        {children}
      </main>
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <TenantSettingsProvider>
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
    </TenantSettingsProvider>
  );
}
