'use client';

import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { Fragment, useState, useEffect } from 'react';
import { LogOut, ChevronDown, LayoutDashboard } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';

const PAGE_LABELS: Record<string, string> = {
  'dashboard': 'Dashboard',
  'products': 'Products',
  'categories': 'Categories',
  'bundles': 'Bundles',
  'discounts': 'Discounts',
  'transactions': 'Transactions',
  'cash-drawer': 'Cash Drawer',
  'expenses': 'Expenses',
  'stock-movements': 'Stock Movements',
  'customers': 'Customers',
  'crm': 'CRM',
  'loyalty': 'Loyalty',
  'users': 'Users',
  'workforce': 'Workforce',
  'attendance': 'Attendance',
  'bookings': 'Bookings',
  'tables': 'Tables',
  'business-hours': 'Business Hours',
  'holidays': 'Holidays',
  'reports': 'Reports',
  'audit-logs': 'Audit Logs',
  'branches': 'Branches',
  'hardware': 'Hardware',
  'tax-rules': 'Tax Rules',
  'bir-compliance': 'BIR Compliance',
  'multi-currency': 'Multi Currency',
  'notification-templates': 'Notifications',
  'advanced-branding': 'Branding',
  'business-types': 'Business Types',
  'feature-flags': 'Feature Flags',
  'subscriptions': 'Subscriptions',
  'backup-reset': 'Backup & Reset',
  'api-docs': 'API Docs',
  'sample-data': 'Sample Data',
  'tenants': 'Tenants',
  'file-upload': 'File Upload',
  'schedule': 'Schedule',
  'commissions': 'Commissions',
  'notifications': 'Notifications',
  'config': 'Config',
};

export default function AdminNavBar() {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const tenant = params?.tenant as string;
  const lang = params?.lang as string;
  const { user, logout } = useAuth();
  const { settings } = useTenantSettings();
  const [menuOpen, setMenuOpen] = useState(false);
  const primaryColor = (settings || getDefaultTenantSettings()).primaryColor || '#3b82f6';

  // Derive breadcrumb segments from pathname: skip tenant, lang, and 'admin'
  const adminBase = `/${tenant}/${lang}/admin`;
  const relativePath = pathname?.replace(adminBase, '') ?? '';
  const segments = relativePath.split('/').filter(Boolean);
  // Filter out dynamic segments (e.g. [customerId])
  const breadcrumbs = segments
    .filter(s => !s.startsWith('['))
    .map(s => ({ slug: s, label: PAGE_LABELS[s] ?? s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }));

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-admin-user-menu]')) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleLogout = async () => {
    await logout();
    router.push(`/${tenant}/${lang}/login`);
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="h-16 flex items-center justify-between px-4 flex-shrink-0">
        {/* Left: breadcrumb */}
        <nav className="min-w-0" aria-label="Breadcrumb">
          <Link
            href={`/${tenant}/${lang}`}
            className="text-sm font-bold shrink-0 leading-none transition-opacity hover:opacity-70"
            style={{ color: primaryColor }}
          >
            {settings?.companyName || 'POS'}
          </Link>
          <span className="mx-1.5 text-gray-300 leading-none select-none">/</span>
          <Link
            href={`/${tenant}/${lang}/admin/dashboard`}
            className="text-sm text-gray-400 shrink-0 leading-none hover:text-gray-600 transition-colors"
          >
            Admin
          </Link>
          {breadcrumbs.map((crumb, i) => (
            <Fragment key={crumb.slug}>
              <span className="mx-1.5 text-gray-300 leading-none select-none">/</span>
              {i === breadcrumbs.length - 1 ? (
                <span className="text-sm text-gray-700 font-medium leading-none truncate">{crumb.label}</span>
              ) : (
                <Link
                  href={`${adminBase}/${segments.slice(0, i + 1).join('/')}`}
                  className="text-sm text-gray-400 leading-none truncate hover:text-gray-600 transition-colors"
                >
                  {crumb.label}
                </Link>
              )}
            </Fragment>
          ))}
        </nav>

        {/* Right: user menu */}
        {user && (
          <div className="relative" data-admin-user-menu>
            <button
              onClick={() => setMenuOpen(prev => !prev)}
              className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 transition-colors"
              aria-expanded={menuOpen}
              aria-haspopup="true"
            >
              <div className="hidden sm:block text-right">
                <div className="text-sm font-semibold text-gray-900 leading-tight">{user.name}</div>
                <div className="text-xs text-gray-500 capitalize leading-tight">{user.role}</div>
              </div>
              <div
                className="w-8 h-8 flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)` }}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 shadow-lg z-50">
                <Link
                  href={`/${tenant}/${lang}`}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <LayoutDashboard className="w-4 h-4 text-gray-400" />
                  Go to POS
                </Link>
                <div className="border-t border-gray-100" />
                <button
                  onClick={() => { setMenuOpen(false); handleLogout(); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
