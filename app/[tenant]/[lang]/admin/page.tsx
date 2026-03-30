'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../dictionaries-client';
import Link from 'next/link';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import { useSubscription } from '@/contexts/SubscriptionContext';

export default function AdminPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [loading, setLoading] = useState(true);
  const { settings } = useTenantSettings();
  const tenantSettings = settings || getDefaultTenantSettings();
  const primaryColor = tenantSettings.primaryColor || '#3b82f6';
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
          <div
            className="inline-block animate-spin h-8 w-8 border-b-2 rounded-full"
            style={{ borderColor: primaryColor, borderBottomColor: 'transparent' }}
          ></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  type AdminCard = {
    title: string;
    description: string;
    href: string;
    featureFlag?: keyof typeof settings;
    icon: React.ReactNode;
    color: string;
  };

  const adminSections: { title: string; description: string; cards: AdminCard[] }[] = [
    {
      title: dict.admin?.sectionStoreOps || 'Store Operations',
      description: dict.admin?.sectionStoreOpsDesc || 'Manage products, sales, and daily business operations',
      cards: [
        {
          title: dict.admin?.products || 'Products',
          description: dict.admin?.productsDescription || 'Manage products, variations, and pricing',
          href: `/${tenant}/${lang}/admin/products`,
          icon: (
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          ),
          color: 'teal',
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
          title: dict.admin?.customers || 'Customers',
          description: dict.admin?.customersDescription || 'Manage customer profiles and purchase history',
          href: `/${tenant}/${lang}/admin/customers`,
          featureFlag: 'enableCustomerManagement' as keyof typeof settings,
          icon: (
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          ),
          color: 'rose',
        },
        {
          title: dict.admin?.loyalty || 'Loyalty Program',
          description: dict.admin?.loyaltyDescription || 'Manage customer loyalty points and rewards',
          href: `/${tenant}/${lang}/admin/loyalty`,
          featureFlag: 'enableLoyaltyProgram' as keyof typeof settings,
          icon: (
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
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
      ],
    },
    {
      title: dict.admin?.sectionInventory || 'Inventory & Stock',
      description: dict.admin?.sectionInventoryDesc || 'Track and manage inventory levels',
      cards: [
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
      ],
    },
    {
      title: dict.admin?.sectionStaffHR || 'Staff & HR',
      description: dict.admin?.sectionStaffHRDesc || 'Employee management and performance tracking',
      cards: [
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
      ],
    },
    {
      title: dict.admin?.sectionSystem || 'System Administration',
      description: dict.admin?.sectionSystemDesc || 'System configuration, security, and compliance',
      cards: [
        {
          title: dict.admin?.users || 'Users',
          description: dict.admin?.usersDescription || 'Manage system users, roles, and permissions',
          href: `/${tenant}/${lang}/admin/users`,
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
          icon: (
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          ),
          color: 'orange',
        },
        {
          title: dict.admin?.subscriptions || 'Subscriptions',
          description: dict.admin?.subscriptionsDescription || 'Manage subscription plans and billing',
          href: `/${tenant}/${lang}/admin/subscriptions`,
          icon: (
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
          color: 'emerald',
        },
        {
          title: dict.admin?.taxRules || 'Tax Rules',
          description: dict.admin?.taxRulesDescription || 'Configure VAT, tax rates, and exemption rules',
          href: `/${tenant}/${lang}/admin/tax-rules`,
          icon: (
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          ),
          color: 'indigo',
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
          title: dict.admin?.birCompliance || 'BIR Compliance',
          description: dict.admin?.birComplianceDescription || 'Manage BIR PTU, CAS reporting, receipt formatting, and audit trail',
          href: `/${tenant}/${lang}/admin/bir-compliance`,
          icon: (
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          ),
          color: 'green',
        },
        {
          title: dict.admin?.featureFlags || 'Feature Flags',
          description: dict.admin?.featureFlagsDescription || 'Enable or disable system features per tenant',
          href: `/${tenant}/${lang}/admin/feature-flags`,
          icon: (
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
            </svg>
          ),
          color: 'cyan',
        },
        {
          title: dict.admin?.hardware || 'Hardware',
          description: dict.admin?.hardwareDescription || 'Configure printers, scanners, and cash drawer devices',
          href: `/${tenant}/${lang}/admin/hardware`,
          icon: (
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
          ),
          color: 'gray',
        },
        {
          title: dict.admin?.backupReset || 'Backup & Reset',
          description: dict.admin?.backupResetDescription || 'Backup data and manage system recovery',
          href: `/${tenant}/${lang}/admin/backup-reset`,
          icon: (
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>
          ),
          color: 'red',
        },
        {
          title: dict.admin?.advancedBranding || 'Advanced Branding',
          description: dict.admin?.advancedBrandingDescription || 'Customize store appearance, colors, and themes',
          href: `/${tenant}/${lang}/admin/advanced-branding`,
          icon: (
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
          ),
          color: 'pink',
        },
        {
          title: dict.admin?.notificationTemplates || 'Notification Templates',
          description: dict.admin?.notificationTemplatesDescription || 'Customize email and notification templates',
          href: `/${tenant}/${lang}/admin/notification-templates`,
          icon: (
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          ),
          color: 'yellow',
        },
        {
          title: dict.admin?.multiCurrency || 'Multi-Currency',
          description: dict.admin?.multiCurrencyDescription || 'Configure which currencies are displayed at the point of sale',
          href: `/${tenant}/${lang}/admin/multi-currency`,
          icon: (
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
          color: 'teal',
        },
        {
          title: dict.admin?.exchangeRates || 'Exchange Rates',
          description: dict.admin?.exchangeRatesDescription || 'Set and update currency exchange rates manually or via API',
          href: `/${tenant}/${lang}/admin/multi-currency`,
          icon: (
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          ),
          color: 'cyan',
        },
        {
          title: dict.admin?.businessHours || 'Business Hours',
          description: dict.admin?.businessHoursDescription || 'Set store operating hours and schedules',
          href: `/${tenant}/${lang}/admin/business-hours`,
          icon: (
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
          color: 'blue',
        },
        {
          title: dict.admin?.holidays || 'Holidays',
          description: dict.admin?.holidaysDescription || 'Manage holiday calendar and non-operating days',
          href: `/${tenant}/${lang}/admin/holidays`,
          icon: (
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          ),
          color: 'orange',
        },
        {
          title: dict.admin?.sampleData || 'Sample Data',
          description: dict.admin?.sampleDataDescription || 'Install sample products, categories, and discounts for your business type',
          href: `/${tenant}/${lang}/admin/sample-data`,
          icon: (
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          ),
          color: 'teal',
        },
      ],
    },
  ];

  const colorClasses: Record<string, { icon: string; text: string }> = {
    teal:    { icon: 'bg-teal-50 text-teal-600 border-teal-200',    text: 'text-teal-600' },
    indigo:  { icon: 'bg-indigo-50 text-indigo-600 border-indigo-200',  text: 'text-indigo-600' },
    amber:   { icon: 'bg-amber-50 text-amber-600 border-amber-200',   text: 'text-amber-600' },
    yellow:  { icon: 'bg-yellow-50 text-yellow-600 border-yellow-200',  text: 'text-yellow-600' },
    rose:    { icon: 'bg-rose-50 text-rose-600 border-rose-200',    text: 'text-rose-600' },
    cyan:    { icon: 'bg-cyan-50 text-cyan-600 border-cyan-200',    text: 'text-cyan-600' },
    emerald: { icon: 'bg-emerald-50 text-emerald-600 border-emerald-200', text: 'text-emerald-600' },
    red:     { icon: 'bg-red-50 text-red-600 border-red-200',      text: 'text-red-600' },
    violet:  { icon: 'bg-violet-50 text-violet-600 border-violet-200',  text: 'text-violet-600' },
    pink:    { icon: 'bg-pink-50 text-pink-600 border-pink-200',    text: 'text-pink-600' },
    blue:    { icon: 'bg-blue-50 text-blue-600 border-blue-200',    text: 'text-blue-600' },
    green:   { icon: 'bg-green-50 text-green-600 border-green-200',   text: 'text-green-600' },
    orange:  { icon: 'bg-orange-50 text-orange-600 border-orange-200',  text: 'text-orange-600' },
    purple:  { icon: 'bg-purple-50 text-purple-600 border-purple-200',  text: 'text-purple-600' },
    slate:   { icon: 'bg-slate-50 text-slate-600 border-slate-200',   text: 'text-slate-600' },
    gray:    { icon: 'bg-gray-50 text-gray-500 border-gray-200',    text: 'text-gray-500' },
  };

  const isCardVisible = (card: AdminCard) => {
    if (!card.featureFlag) return true;
    if (!settings) return true;
    if (subscriptionStatus && !subscriptionStatus.features[card.featureFlag]) return false;
    return settings[card.featureFlag] !== false;
  };

  return (
    <div>
      <Navbar />
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
            {dict.admin?.title || 'Admin Management'}
          </h1>
          <p className="text-gray-600">{dict.admin?.subtitle || 'Manage users, tenants, and system settings'}</p>
        </div>
        {/* Subscription Usage Card */}
        {subscriptionStatus && (
          <Link
            href={`/${tenant}/${lang}/admin/subscriptions`}
            className="mb-6 block bg-white border rounded-xl p-6 transition-all duration-200 hover:shadow-md"
            style={{ borderColor: primaryColor }}
          >
            <div className="flex items-start justify-between mb-4">
              <div
                className="inline-flex p-3 border"
                style={{ background: `${primaryColor}11`, color: primaryColor, borderColor: primaryColor }}
              >
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                subscriptionStatus.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {subscriptionStatus.isActive ? (dict.admin?.active || 'Active') : (dict.admin?.inactive || 'Inactive')}
              </span>
            </div>

            <h2 className="text-xl font-bold text-gray-900 mb-1">{dict.admin?.subscriptionUsage || 'Subscription Usage'}</h2>
            <p className="text-gray-600 text-sm mb-4">{subscriptionStatus.planName} {dict.admin?.plan || 'Plan'}</p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-gray-50 rounded p-3 text-center">
                <div className="text-2xl font-bold" style={{ color: primaryColor }}>{subscriptionStatus.usage.currentUsers}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {dict.admin?.users || 'Users'} / {subscriptionStatus.limits.maxUsers === -1 ? '∞' : subscriptionStatus.limits.maxUsers}
                </div>
              </div>
              <div className="bg-gray-50 rounded p-3 text-center">
                <div className="text-2xl font-bold text-green-600">{subscriptionStatus.usage.currentBranches}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {dict.admin?.branches || 'Branches'} / {subscriptionStatus.limits.maxBranches === -1 ? '∞' : subscriptionStatus.limits.maxBranches}
                </div>
              </div>
              <div className="bg-gray-50 rounded p-3 text-center">
                <div className="text-2xl font-bold text-orange-600">{subscriptionStatus.usage.currentProducts}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {dict.admin?.products || 'Products'} / {subscriptionStatus.limits.maxProducts === -1 ? '∞' : subscriptionStatus.limits.maxProducts}
                </div>
              </div>
              <div className="bg-gray-50 rounded p-3 text-center">
                <div className="text-2xl font-bold text-purple-600">{subscriptionStatus.usage.currentTransactions}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {dict.admin?.transactions || 'Transactions'} / {subscriptionStatus.limits.maxTransactions === -1 ? '∞' : subscriptionStatus.limits.maxTransactions}
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center font-medium text-sm" style={{ color: primaryColor }}>
              <span>{dict.admin?.manageSubscription || 'Manage Subscription'}</span>
              <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        )}
        {adminSections.map((section, sectionIndex) => {
          const visibleCards = section.cards.filter(isCardVisible);
          if (visibleCards.length === 0) return null;

          return (
            <div key={sectionIndex} className="mb-10">
              <div className="mb-4">
                <h2 className="text-xl font-bold text-gray-900">{section.title}</h2>
                <p className="text-gray-500 text-sm">{section.description}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {visibleCards.map((card, cardIndex) => {
                  const cc = colorClasses[card.color] ?? colorClasses.gray;
                  return (
                    <Link
                      key={cardIndex}
                      href={card.href}
                      className="group bg-white border rounded-xl p-6 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
                      style={{ borderColor: `${primaryColor}40` }}
                    >
                      <div className={`inline-flex p-3 rounded-lg border mb-4 ${cc.icon}`}>
                        {card.icon}
                      </div>
                      <h2 className="text-xl font-bold text-gray-900 mb-2">{card.title}</h2>
                      <p className="text-gray-500 text-sm">{card.description}</p>
                      <div className={`mt-4 flex items-center font-medium text-sm ${cc.text}`}>
                        <span>{dict.common?.view || 'View'} {card.title}</span>
                        <svg className="w-4 h-4 ml-1.5 transition-transform duration-150 group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
