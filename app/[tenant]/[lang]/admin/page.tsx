'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '../dictionaries-client';
import Link from 'next/link';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';

export default function AdminPage() {
  const params = useParams();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _router = useRouter();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const { settings } = useTenantSettings();

  useEffect(() => {
    getDictionaryClient(lang).then((d) => {
      setDict(d);
      setLoading(false);
    });
  }, [lang]);

  if (!dict || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">{(dict?.common as Record<string, unknown>)?.loading as string || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  const allAdminCards = [
    {
      title: (dict?.admin as Record<string, unknown>)?.users as string || 'Users',
      description: (dict?.admin as Record<string, unknown>)?.usersDescription as string || 'Manage system users, roles, and permissions',
      href: `/${tenant}/${lang}/admin/users`,
      featureFlag: undefined as keyof typeof settings | undefined,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      color: 'blue',
    },
    {
      title: (dict?.admin as Record<string, unknown>)?.tenants as string || 'Tenants',
      description: (dict?.admin as Record<string, unknown>)?.tenantsDescription as string || 'Manage multi-tenant organizations and settings',
      href: `/${tenant}/${lang}/admin/tenants`,
      featureFlag: undefined as keyof typeof settings | undefined,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      color: 'green',
    },
    {
      title: (dict?.admin as Record<string, unknown>)?.branches as string || 'Branches',
      description: (dict?.admin as Record<string, unknown>)?.branchesDescription as string || 'Manage store branches and locations',
      href: `/${tenant}/${lang}/admin/branches`,
      featureFlag: undefined as keyof typeof settings | undefined,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      color: 'orange',
    },
    {
      title: (dict?.admin as Record<string, unknown>)?.categories as string || 'Categories',
      description: (dict?.admin as Record<string, unknown>)?.categoriesDescription as string || 'Manage product categories',
      href: `/${tenant}/${lang}/admin/categories`,
      featureFlag: 'enableCategories' as keyof typeof settings,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
      ),
      color: 'indigo',
    },
    {
      title: (dict?.admin as Record<string, unknown>)?.products as string || 'Products',
      description: (dict?.admin as Record<string, unknown>)?.productsDescription as string || 'Manage products, variations, and bundles',
      href: `/${tenant}/${lang}/admin/products`,
      featureFlag: undefined as keyof typeof settings | undefined,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
      color: 'teal',
    },
    {
      title: (dict?.admin as Record<string, unknown>)?.discounts as string || 'Discounts',
      description: (dict?.admin as Record<string, unknown>)?.discountsDescription as string || 'Manage discount codes and promotions',
      href: `/${tenant}/${lang}/admin/discounts`,
      featureFlag: 'enableDiscounts' as keyof typeof settings,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'yellow',
    },
    {
      title: (dict?.admin as Record<string, unknown>)?.transactions as string || 'Transactions',
      description: (dict?.admin as Record<string, unknown>)?.transactionsDescription as string || 'View and manage all sales transactions',
      href: `/${tenant}/${lang}/admin/transactions`,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
      color: 'cyan',
    },
    {
      title: (dict?.admin as Record<string, unknown>)?.stockMovements as string || 'Stock Movements',
      description: (dict?.admin as Record<string, unknown>)?.stockMovementsDescription as string || 'Track all inventory changes and movements',
      href: `/${tenant}/${lang}/admin/stock-movements`,
      featureFlag: 'enableInventory' as keyof typeof settings,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      ),
      color: 'pink',
    },
    {
      title: (dict?.admin as Record<string, unknown>)?.cashDrawer as string || 'Cash Drawer',
      description: (dict?.admin as Record<string, unknown>)?.cashDrawerDescription as string || 'Manage and monitor cash drawer operations',
      href: `/${tenant}/${lang}/admin/cash-drawer`,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      color: 'emerald',
    },
    {
      title: (dict?.admin as Record<string, unknown>)?.expenses as string || 'Expenses',
      description: (dict?.admin as Record<string, unknown>)?.expensesDescription as string || 'Manage and track business expenses',
      href: `/${tenant}/${lang}/admin/expenses`,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      color: 'red',
    },
    {
      title: (dict?.admin as Record<string, unknown>)?.auditLogs as string || 'Audit Logs',
      description: (dict?.admin as Record<string, unknown>)?.auditLogsDescription as string || 'View system activity, changes, and user actions',
      href: `/${tenant}/${lang}/admin/audit-logs`,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      color: 'purple',
    },
    {
      title: (dict?.admin as Record<string, unknown>)?.bookings as string || 'Bookings',
      description: (dict?.admin as Record<string, unknown>)?.bookingsDescription as string || 'Manage appointments, scheduling, and bookings',
      href: `/${tenant}/${lang}/admin/bookings`,
      featureFlag: 'enableBookingScheduling' as keyof typeof settings,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      color: 'violet',
    },
    {
      title: (dict?.admin as Record<string, unknown>)?.bundles as string || 'Bundles',
      description: (dict?.admin as Record<string, unknown>)?.bundlesDescription as string || 'Manage product bundles and packages',
      href: `/${tenant}/${lang}/admin/bundles`,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
      color: 'amber',
    },
    {
      title: (dict?.admin as Record<string, unknown>)?.attendance as string || 'Attendance',
      description: (dict?.admin as Record<string, unknown>)?.attendanceDescription as string || 'View and manage employee attendance records',
      href: `/${tenant}/${lang}/admin/attendance`,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'rose',
    },
    {
      title: (dict?.admin as Record<string, unknown>)?.backupReset as string || 'Backup & Reset',
      description: (dict?.admin as Record<string, unknown>)?.backupResetDescription as string || 'Backup and reset collection data',
      href: `/${tenant}/${lang}/admin/backup-reset`,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      ),
      color: 'red',
    },
    {
      title: (dict?.admin as Record<string, unknown>)?.featureFlags as string || 'Feature Flags',
      description: (dict?.admin as Record<string, unknown>)?.featureFlagsDescription as string || 'Enable or disable system-wide features',
      href: `/${tenant}/${lang}/admin/feature-flags`,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      color: 'blue',
    },
    {
      title: (dict?.admin as Record<string, unknown>)?.hardwareSettings as string || 'Hardware Settings',
      description: (dict?.admin as Record<string, unknown>)?.hardwareSettingsDescription as string || 'Configure printers, scanners, and hardware devices',
      href: `/${tenant}/${lang}/admin/hardware`,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
        </svg>
      ),
      color: 'gray',
    },
    {
      title: (dict?.admin as Record<string, unknown>)?.taxRules as string || 'Tax Rules',
      description: (dict?.admin as Record<string, unknown>)?.taxRulesDescription as string || 'Configure multiple tax rates and regional rules',
      href: `/${tenant}/${lang}/admin/tax-rules`,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      color: 'indigo',
    },
    {
      title: (dict?.admin as Record<string, unknown>)?.businessHours as string || 'Business Hours',
      description: (dict?.admin as Record<string, unknown>)?.businessHoursDescription as string || 'Configure weekly schedule and special hours',
      href: `/${tenant}/${lang}/admin/business-hours`,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'orange',
    },
    {
      title: (dict?.admin as Record<string, unknown>)?.holidays as string || 'Holidays',
      description: (dict?.admin as Record<string, unknown>)?.holidaysDescription as string || 'Manage holiday calendar and business closures',
      href: `/${tenant}/${lang}/admin/holidays`,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      color: 'yellow',
    },
    {
      title: (dict?.admin as Record<string, unknown>)?.multiCurrency as string || 'Multi-Currency',
      description: (dict?.admin as Record<string, unknown>)?.multiCurrencyDescription as string || 'Manage exchange rates and API settings',
      href: `/${tenant}/${lang}/admin/multi-currency`,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'green',
    },
    {
      title: (dict?.admin as Record<string, unknown>)?.notificationTemplates as string || 'Notification Templates',
      description: (dict?.admin as Record<string, unknown>)?.notificationTemplatesDescription as string || 'Customize email and SMS templates',
      href: `/${tenant}/${lang}/admin/notification-templates`,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      color: 'purple',
    },
    {
      title: (dict?.admin as Record<string, unknown>)?.advancedBranding as string || 'Advanced Branding',
      description: (dict?.admin as Record<string, unknown>)?.advancedBrandingDescription as string || 'Customize fonts, themes, and CSS',
      href: `/${tenant}/${lang}/admin/advanced-branding`,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
        </svg>
      ),
      color: 'pink',
    },
    {
      title: (dict?.admin as Record<string, unknown>)?.reports as string || 'Reports',
      description: (dict?.admin as Record<string, unknown>)?.reportsDescription as string || 'View detailed reports and analytics',
      href: `/${tenant}/${lang}/reports`,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      color: 'slate',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
            {(dict?.admin as Record<string, unknown>)?.title as string || 'Admin Management'}
          </h1>
          <p className="text-gray-600">{(dict?.admin as Record<string, unknown>)?.subtitle as string || 'Manage users, tenants, and system settings'}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allAdminCards
            .filter(card => {
              if (!card.featureFlag) return true;
              if (!settings) return true; // Show by default if settings not loaded yet
              return settings[card.featureFlag] !== false; // Show if enabled or undefined (default enabled)
            })
            .map((card, index) => (
            <Link
              key={index}
              href={card.href}
              className="bg-white border border-gray-300 p-6 hover:border-blue-500 transition-all duration-200"
            >
              <div className={`inline-flex p-3 border mb-4 ${
                card.color === 'blue' ? 'bg-blue-100 text-blue-600' :
                card.color === 'green' ? 'bg-green-100 text-green-600' :
                card.color === 'orange' ? 'bg-orange-100 text-orange-600' :
                card.color === 'indigo' ? 'bg-indigo-100 text-indigo-600' :
                card.color === 'red' ? 'bg-red-100 text-red-600' :
                card.color === 'teal' ? 'bg-teal-100 text-teal-600' :
                card.color === 'yellow' ? 'bg-yellow-100 text-yellow-600' :
                card.color === 'cyan' ? 'bg-cyan-100 text-cyan-600' :
                card.color === 'pink' ? 'bg-pink-100 text-pink-600' :
                card.color === 'emerald' ? 'bg-emerald-100 text-emerald-600' :
                card.color === 'violet' ? 'bg-violet-100 text-violet-600' :
                card.color === 'amber' ? 'bg-amber-100 text-amber-600' :
                card.color === 'rose' ? 'bg-rose-100 text-rose-600' :
                card.color === 'slate' ? 'bg-slate-100 text-slate-600' :
                card.color === 'gray' ? 'bg-gray-100 text-gray-600' :
                'bg-purple-100 text-purple-600'
              }`}>
                {card.icon}
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">{card.title}</h2>
              <p className="text-gray-600 text-sm">{card.description}</p>
              <div className="mt-4 flex items-center text-blue-600 font-medium text-sm">
                <span>{(dict?.common as Record<string, unknown>)?.view as string || 'View'} {card.title}</span>
                <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
