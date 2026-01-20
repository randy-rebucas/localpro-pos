'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '../dictionaries-client';
import Link from 'next/link';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { useSubscription } from '@/contexts/SubscriptionContext';

export default function AdminPage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { settings } = useTenantSettings();
  const { subscriptionStatus } = useSubscription();

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
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  const allAdminCards = [
    {
      title: dict.admin?.users || 'Users',
      description: dict.admin?.usersDescription || 'Manage system users, roles, and permissions',
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
      title: dict.admin?.tenants || 'Tenants',
      description: dict.admin?.tenantsDescription || 'Manage multi-tenant organizations and settings',
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
      title: dict.admin?.branches || 'Branches',
      description: dict.admin?.branchesDescription || 'Manage store branches and locations',
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
      title: dict.admin?.categories || 'Categories',
      description: dict.admin?.categoriesDescription || 'Manage product categories',
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
      title: dict.admin?.products || 'Products',
      description: dict.admin?.productsDescription || 'Manage products, variations, and bundles',
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
      title: dict.admin?.discounts || 'Discounts',
      description: dict.admin?.discountsDescription || 'Manage discount codes and promotions',
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
      title: dict.admin?.transactions || 'Transactions',
      description: dict.admin?.transactionsDescription || 'View and manage all sales transactions',
      href: `/${tenant}/${lang}/admin/transactions`,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
      color: 'cyan',
    },
    {
      title: dict.admin?.stockMovements || 'Stock Movements',
      description: dict.admin?.stockMovementsDescription || 'Track all inventory changes and movements',
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
      title: dict.admin?.cashDrawer || 'Cash Drawer',
      description: dict.admin?.cashDrawerDescription || 'Manage and monitor cash drawer operations',
      href: `/${tenant}/${lang}/admin/cash-drawer`,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      color: 'emerald',
    },
    {
      title: dict.admin?.expenses || 'Expenses',
      description: dict.admin?.expensesDescription || 'Manage and track business expenses',
      href: `/${tenant}/${lang}/admin/expenses`,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      color: 'red',
    },
    {
      title: dict.admin?.auditLogs || 'Audit Logs',
      description: dict.admin?.auditLogsDescription || 'View system activity, changes, and user actions',
      href: `/${tenant}/${lang}/admin/audit-logs`,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      color: 'purple',
    },
    {
      title: dict.admin?.bookings || 'Bookings',
      description: dict.admin?.bookingsDescription || 'Manage appointments, scheduling, and bookings',
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
      title: dict.admin?.bundles || 'Bundles',
      description: dict.admin?.bundlesDescription || 'Manage product bundles and packages',
      href: `/${tenant}/${lang}/admin/bundles`,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
      color: 'amber',
    },
    {
      title: dict.admin?.attendance || 'Attendance',
      description: dict.admin?.attendanceDescription || 'View and manage employee attendance records',
      href: `/${tenant}/${lang}/admin/attendance`,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'rose',
    },
    {
      title: dict.admin?.subscriptions || 'Subscriptions',
      description: dict.admin?.subscriptionsDescription || 'Manage subscription plans and billing',
      href: `/${tenant}/${lang}/admin/subscriptions`,
      featureFlag: undefined as keyof typeof settings | undefined,
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'emerald',
    },
    {
      title: dict.admin?.reports || 'Reports',
      description: dict.admin?.reportsDescription || 'View detailed reports and analytics',
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
    <div>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
            {dict.admin?.title || 'Admin Management'}
          </h1>
          <p className="text-gray-600">{dict.admin?.subtitle || 'Manage users, tenants, and system settings'}</p>
        </div>

        {/* Subscription Usage Summary */}
        {subscriptionStatus && (
          <div className="col-span-full mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Subscription Usage</h2>
                  <p className="text-sm text-gray-600">{subscriptionStatus.planName} Plan</p>
                </div>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  subscriptionStatus.isActive
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  {subscriptionStatus.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{subscriptionStatus.usage.currentUsers}</div>
                  <div className="text-xs text-gray-500">
                    Users ({subscriptionStatus.limits.maxUsers === -1 ? '∞' : subscriptionStatus.limits.maxUsers})
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{subscriptionStatus.usage.currentBranches}</div>
                  <div className="text-xs text-gray-500">
                    Branches ({subscriptionStatus.limits.maxBranches === -1 ? '∞' : subscriptionStatus.limits.maxBranches})
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{subscriptionStatus.usage.currentProducts}</div>
                  <div className="text-xs text-gray-500">
                    Products ({subscriptionStatus.limits.maxProducts === -1 ? '∞' : subscriptionStatus.limits.maxProducts})
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{subscriptionStatus.usage.currentTransactions}</div>
                  <div className="text-xs text-gray-500">
                    Transactions ({subscriptionStatus.limits.maxTransactions === -1 ? '∞' : subscriptionStatus.limits.maxTransactions})
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allAdminCards
            .filter(card => {
              if (!card.featureFlag) return true;
              if (!settings) return true; // Show by default if settings not loaded yet

              // Check subscription features first
              if (subscriptionStatus && !subscriptionStatus.features[card.featureFlag]) {
                return false; // Hide if subscription doesn't support this feature
              }

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
                'bg-purple-100 text-purple-600'
              }`}>
                {card.icon}
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">{card.title}</h2>
              <p className="text-gray-600 text-sm">{card.description}</p>
              <div className="mt-4 flex items-center text-blue-600 font-medium text-sm">
                <span>{dict.common?.view || 'View'} {card.title}</span>
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
