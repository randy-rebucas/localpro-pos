'use client';

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { TenantSettingsProvider } from '@/contexts/TenantSettingsContext';
import { SubscriptionGuard } from '@/components/SubscriptionGuard';
import ErrorBoundary from '@/components/ErrorBoundary';
import {
  LayoutDashboard,
  Package,
  Tag,
  Layers,
  Percent,
  Receipt,
  Wallet,
  CreditCard,
  ArrowLeftRight,
  Users,
  UserCheck,
  Gift,
  UserCog,
  Briefcase,
  Clock,
  CalendarCheck,
  LayoutGrid,
  Clock4,
  Calendar,
  BarChart3,
  FileText,
  Building2,
  Printer,
  Calculator,
  FileCheck,
  DollarSign,
  Bell,
  Palette,
  Store,
  ToggleLeft,
  RotateCcw,
  Code2,
  Database,
  Building,
  ChevronDown,
  Menu,
  X,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

function AdminSidebar({ collapsed, onClose }: { collapsed?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const params = useParams();
  const tenant = (params?.tenant as string) || 'default';
  const lang = (params?.lang as string) || 'en';
  const base = `/${tenant}/${lang}/admin`;

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Overview: true,
    Catalog: true,
    Sales: true,
    Inventory: true,
    Customers: true,
    Staff: true,
    Scheduling: false,
    Reports: true,
    Settings: false,
  });

  const navGroups: NavGroup[] = [
    {
      label: 'Overview',
      items: [
        { label: 'Dashboard', href: `${base}/dashboard`, icon: LayoutDashboard },
      ],
    },
    {
      label: 'Catalog',
      items: [
        { label: 'Products', href: `${base}/products`, icon: Package },
        { label: 'Categories', href: `${base}/categories`, icon: Tag },
        { label: 'Bundles', href: `${base}/bundles`, icon: Layers },
        { label: 'Discounts', href: `${base}/discounts`, icon: Percent },
      ],
    },
    {
      label: 'Sales',
      items: [
        { label: 'Transactions', href: `${base}/transactions`, icon: Receipt },
        { label: 'Cash Drawer', href: `${base}/cash-drawer`, icon: Wallet },
        { label: 'Expenses', href: `${base}/expenses`, icon: CreditCard },
      ],
    },
    {
      label: 'Inventory',
      items: [
        { label: 'Stock Movements', href: `${base}/stock-movements`, icon: ArrowLeftRight },
      ],
    },
    {
      label: 'Customers',
      items: [
        { label: 'Customers', href: `${base}/customers`, icon: Users },
        { label: 'CRM', href: `${base}/crm`, icon: UserCheck },
        { label: 'Loyalty', href: `${base}/loyalty`, icon: Gift },
      ],
    },
    {
      label: 'Staff',
      items: [
        { label: 'Users', href: `${base}/users`, icon: UserCog },
        { label: 'Workforce', href: `${base}/workforce`, icon: Briefcase },
        { label: 'Attendance', href: `${base}/attendance`, icon: Clock },
      ],
    },
    {
      label: 'Scheduling',
      items: [
        { label: 'Bookings', href: `${base}/bookings`, icon: CalendarCheck },
        { label: 'Tables', href: `${base}/tables`, icon: LayoutGrid },
        { label: 'Business Hours', href: `${base}/business-hours`, icon: Clock4 },
        { label: 'Holidays', href: `${base}/holidays`, icon: Calendar },
      ],
    },
    {
      label: 'Reports',
      items: [
        { label: 'Reports', href: `${base}/reports`, icon: BarChart3 },
        { label: 'Audit Logs', href: `${base}/audit-logs`, icon: FileText },
      ],
    },
    {
      label: 'Settings',
      items: [
        { label: 'Branches', href: `${base}/branches`, icon: Building2 },
        { label: 'Hardware', href: `${base}/hardware`, icon: Printer },
        { label: 'Tax Rules', href: `${base}/tax-rules`, icon: Calculator },
        { label: 'BIR Compliance', href: `${base}/bir-compliance`, icon: FileCheck },
        { label: 'Multi Currency', href: `${base}/multi-currency`, icon: DollarSign },
        { label: 'Notifications', href: `${base}/notification-templates`, icon: Bell },
        { label: 'Branding', href: `${base}/advanced-branding`, icon: Palette },
        { label: 'Business Types', href: `${base}/business-types`, icon: Store },
        { label: 'Feature Flags', href: `${base}/feature-flags`, icon: ToggleLeft },
        { label: 'Subscriptions', href: `${base}/subscriptions`, icon: CreditCard },
        { label: 'Backup & Reset', href: `${base}/backup-reset`, icon: RotateCcw },
        { label: 'API Docs', href: `${base}/api-docs`, icon: Code2 },
        { label: 'Sample Data', href: `${base}/sample-data`, icon: Database },
        { label: 'Tenants', href: `${base}/tenants`, icon: Building },
      ],
    },
  ];

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const isActive = (href: string) =>
    pathname === href || (pathname !== base && pathname.startsWith(href + '/'));

  return (
    <aside className="flex flex-col h-full bg-white border-r border-gray-200 w-56">
      {/* Sidebar header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 h-16 flex-shrink-0">
        <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Admin</span>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto py-2">
        {navGroups.map((group) => {
          const isOpen = openGroups[group.label] !== false;
          const hasActive = group.items.some(item => isActive(item.href));

          return (
            <div key={group.label} className="mb-1">
              <button
                onClick={() => toggleGroup(group.label)}
                className={`w-full flex items-center justify-between px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  hasActive ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <span>{group.label}</span>
                <ChevronDown
                  className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {isOpen && (
                <ul>
                  {group.items.map((item) => {
                    const active = isActive(item.href);
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onClose}
                          className={`flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                            active
                              ? 'bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-600'
                              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                          }`}
                        >
                          <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-blue-600' : 'text-gray-400'}`} />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <TenantSettingsProvider>
      <ProtectedRoute requiredRoles={['owner', 'admin', 'manager']}>
        <SubscriptionGuard>
          <ErrorBoundary>
            <div className="flex h-screen overflow-hidden bg-gray-50">

              {/* Desktop sidebar — always visible */}
              <div className="hidden lg:flex lg:flex-shrink-0">
                <AdminSidebar />
              </div>

              {/* Mobile sidebar overlay */}
              {mobileSidebarOpen && (
                <>
                  <div
                    className="fixed inset-0 bg-black/40 z-40 lg:hidden"
                    onClick={() => setMobileSidebarOpen(false)}
                    aria-hidden="true"
                  />
                  <div className="fixed inset-y-0 left-0 z-50 lg:hidden">
                    <AdminSidebar onClose={() => setMobileSidebarOpen(false)} />
                  </div>
                </>
              )}

              {/* Mobile toggle button — renders above page content */}
              <button
                onClick={() => setMobileSidebarOpen(true)}
                className="lg:hidden fixed bottom-4 left-4 z-30 p-3 bg-white border border-gray-300 shadow-md text-gray-600 hover:text-gray-900 transition-colors"
                aria-label="Open admin menu"
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Content area */}
              <div className="flex-1 overflow-y-auto min-w-0">
                {children}
              </div>

            </div>
          </ErrorBoundary>
        </SubscriptionGuard>
      </ProtectedRoute>
    </TenantSettingsProvider>
  );
}
