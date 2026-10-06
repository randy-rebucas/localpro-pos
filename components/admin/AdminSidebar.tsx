'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard, BarChart2, Package, Tag, Layers, Boxes, ArrowUpDown,
  Receipt, Percent, DollarSign, TrendingDown, Users, Heart, Megaphone,
  CalendarDays, LayoutGrid, UserCheck, ShieldCheck, Building2, FileText, Truck,
  UtensilsCrossed, ShoppingBag, WashingMachine, Briefcase, Pill, CalendarClock,
  Settings, Clock, Users2, GitBranch, Calculator, CreditCard, Monitor, Bell,
  Palette, ToggleLeft, ClipboardList, Database, ChevronDown, ChevronRight,
  LogOut, Store, ShoppingCart, Code2, Sparkles, Lock, Smartphone, ChefHat, BookOpen,
  Contact, FileBox, ArrowRightLeft, ReceiptText
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import { useAdminLayout } from '@/contexts/AdminLayoutContext';
import { usePermissions } from '@/hooks/usePermissions';
import { supportsFeature } from '@/lib/business-type-helpers';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  exact?: boolean;
  /** Permission key (see lib/permissions.ts) gating this item. Owner/admin/super_admin always see everything regardless. Omit for items visible to any admin-panel user. */
  permission?: string;
  /** Business-type feature flag (see lib/business-type-helpers.ts supportsFeature) gating this item's visibility. Omit for items visible regardless of business type. */
  feature?: 'inventory' | 'booking' | 'delivery' | 'workOrders' | 'laundryOrders' | 'kitchenDisplay' | 'tableManagement' | 'categories' | 'suppliers' | 'expenses' | 'employees' | 'accounting';
}

interface NavGroup {
  id: string;
  title: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

export default function AdminSidebar() {
  const params = useParams();
  const pathname = usePathname();
  const tenant = (params?.tenant as string) || 'default';
  const lang = (params?.lang as string) || 'en';
  const { user, logout } = useAuth();
  const { canAccess } = usePermissions();
  const [navDict, setNavDict] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    getDictionaryClient(lang === 'es' ? 'es' : 'en').then((d) => setNavDict(d?.adminNav ?? null));
  }, [lang]);

  // English fallback keeps the sidebar readable before the dictionary loads.
  const t = (key: string, fallback: string) => navDict?.[key] || fallback;

  const { settings } = useTenantSettings();

  // Owner/admin/super_admin always see every nav item, regardless of permission;
  // business-type feature gating (e.g. Kitchen Display only for restaurant) applies to everyone.
  const canSeeItem = (item: NavItem) => {
    if (item.feature && !supportsFeature(settings ?? undefined, item.feature)) return false;
    if (!item.permission) return true;
    return canAccess(item.permission);
  };
  const { sidebarOpen, sidebarCollapsed, closeMobileSidebar } = useAdminLayout();

  const primaryColor = (settings || getDefaultTenantSettings()).primaryColor || '#35979c';

  const base = `/${tenant}/${lang}`;

  const navGroups: NavGroup[] = [
    {
      id: 'overview',
      title: t('groupOverview', 'Overview'),
      defaultOpen: true,
      items: [
        { label: t('dashboard', 'Dashboard'), href: `${base}/admin`, icon: LayoutDashboard, exact: true, permission: 'dashboard.view' },
        { label: t('reports', 'Reports'), href: `${base}/admin/reports`, icon: BarChart2, permission: 'reports.view' },
      ],
    },
    {
      id: 'catalog',
      title: t('groupCatalog', 'Catalog'),
      defaultOpen: true,
      items: [
        { label: t('products', 'Products'), href: `${base}/admin/products`, icon: Package, permission: 'products.manage' },
        { label: t('categories', 'Categories'), href: `${base}/admin/categories`, icon: Tag, permission: 'categories.manage', feature: 'categories' },
        { label: t('bundles', 'Bundles'), href: `${base}/admin/bundles`, icon: Layers, permission: 'bundles.manage' },
        { label: t('inventory', 'Inventory'), href: `${base}/admin/inventory`, icon: Boxes, permission: 'inventory.view', feature: 'inventory' },
        { label: t('stockMovements', 'Stock Movements'), href: `${base}/admin/stock-movements`, icon: ArrowUpDown, permission: 'stock_movements.view', feature: 'inventory' },
        { label: t('suppliers', 'Suppliers'), href: `${base}/admin/suppliers`, icon: Contact, permission: 'suppliers.view', feature: 'suppliers' },
        { label: t('purchaseOrders', 'Purchase Orders'), href: `${base}/admin/purchase-orders`, icon: FileBox, permission: 'purchase_orders.view', feature: 'suppliers' },
        { label: t('stockTransfers', 'Stock Transfers'), href: `${base}/admin/stock-transfers`, icon: ArrowRightLeft, permission: 'stock_transfers.view', feature: 'inventory' },
      ],
    },
    {
      id: 'sales',
      title: t('groupSales', 'Sales'),
      defaultOpen: true,
      items: [
        { label: t('transactions', 'Transactions'), href: `${base}/admin/transactions`, icon: Receipt, permission: 'transactions.view' },
        { label: t('discounts', 'Discounts'), href: `${base}/admin/discounts`, icon: Percent, permission: 'discounts.manage' },
        { label: t('cashDrawer', 'Cash Drawer'), href: `${base}/admin/cash-drawer`, icon: DollarSign, permission: 'cash_drawer.view' },
        { label: t('expenses', 'Expenses'), href: `${base}/admin/expenses`, icon: TrendingDown, permission: 'expenses.manage', feature: 'expenses' },
        { label: t('invoices', 'Invoices'), href: `${base}/admin/invoices`, icon: ReceiptText, permission: 'invoices.view' },
        { label: t('ledger', 'Ledger'), href: `${base}/admin/ledger`, icon: BookOpen, permission: 'ledger.view', feature: 'accounting' },
      ],
    },
    {
      id: 'customers',
      title: t('groupCustomers', 'Customers'),
      defaultOpen: false,
      items: [
        { label: t('customers', 'Customers'), href: `${base}/admin/customers`, icon: Users, permission: 'customers.manage' },
        { label: t('customerGroups', 'Customer Groups'), href: `${base}/admin/customer-groups`, icon: Users2, permission: 'customer_groups.view' },
        { label: t('loyalty', 'Loyalty'), href: `${base}/admin/loyalty`, icon: Heart, permission: 'loyalty.view' },
        { label: t('crm', 'CRM'), href: `${base}/admin/crm`, icon: Megaphone, permission: 'crm.view' },
      ],
    },
    {
      id: 'operations',
      title: t('groupOperations', 'Operations'),
      defaultOpen: false,
      items: [
        { label: t('bookings', 'Bookings'), href: `${base}/admin/bookings`, icon: CalendarDays, permission: 'bookings.view', feature: 'booking' },
        { label: t('delivery', 'Delivery'), href: `${base}/admin/delivery`, icon: Truck, permission: 'delivery.view', feature: 'delivery' },
        { label: t('workOrders', 'Work Orders'), href: `${base}/admin/work-orders`, icon: ClipboardList, permission: 'work_orders.view', feature: 'workOrders' },
        { label: t('deposits', 'Deposits'), href: `${base}/admin/deposits`, icon: DollarSign, permission: 'deposits.view' },
        { label: t('laundryOrders', 'Laundry Orders'), href: `${base}/admin/laundry`, icon: WashingMachine, permission: 'laundry_orders.view', feature: 'laundryOrders' },
        { label: t('kitchenDisplay', 'Kitchen Display'), href: `${base}/admin/kitchen-display`, icon: ChefHat, permission: 'kitchen_display.view', feature: 'kitchenDisplay' },
        { label: t('tables', 'Tables'), href: `${base}/admin/tables`, icon: LayoutGrid, permission: 'tables.view', feature: 'tableManagement' },
        { label: t('attendance', 'Attendance'), href: `${base}/admin/attendance`, icon: UserCheck, permission: 'attendance.view', feature: 'employees' },
        { label: t('channelOrders', 'Channel Orders'), href: `${base}/admin/channel-orders`, icon: ShoppingCart, permission: 'integrations.view' },
      ],
    },
    {
      id: 'compliance',
      title: t('groupCompliance', 'Compliance'),
      defaultOpen: false,
      items: [
        { label: t('complianceStatus', 'Compliance Status'), href: `${base}/admin/compliance`, icon: ShieldCheck, permission: 'compliance.view' },
        { label: t('businessPermits', 'Business Permits'), href: `${base}/admin/business-permits`, icon: Building2, permission: 'business_permits.manage' },
        { label: t('birCompliance', 'BIR Compliance'), href: `${base}/admin/bir-compliance`, icon: FileText, permission: 'bir_compliance.manage' },
        { label: t('restaurantCompliance', 'Restaurant'), href: `${base}/admin/restaurant-compliance`, icon: UtensilsCrossed, permission: 'restaurant_compliance.manage' },
        { label: t('retailCompliance', 'Retail'), href: `${base}/admin/retail-compliance`, icon: ShoppingBag, permission: 'retail_compliance.manage' },
        { label: t('laundryCompliance', 'Laundry'), href: `${base}/admin/laundry-compliance`, icon: WashingMachine, permission: 'laundry_compliance.manage' },
        { label: t('serviceCompliance', 'Service'), href: `${base}/admin/service-compliance`, icon: Briefcase, permission: 'service_compliance.manage' },
        { label: t('pharmacyCompliance', 'Pharmacy'), href: `${base}/admin/pharmacy-compliance`, icon: Pill, permission: 'pharmacy_compliance.manage' },
        { label: t('prescriptions', 'Prescriptions'), href: `${base}/admin/prescriptions`, icon: FileText, permission: 'prescriptions.view' },
        { label: t('expiryTracking', 'Expiry Tracking'), href: `${base}/admin/expiry-tracking`, icon: CalendarClock, permission: 'expiry_tracking.manage' },
      ],
    },
    {
      id: 'configuration',
      title: t('groupConfiguration', 'Configuration'),
      defaultOpen: false,
      items: [
        { label: t('users', 'Users'), href: `${base}/admin/users`, icon: Users2, permission: 'users.view', feature: 'employees' },
        { label: t('branches', 'Branches'), href: `${base}/admin/branches`, icon: GitBranch, permission: 'branches.manage' },
        { label: t('businessType', 'Business Type'), href: `${base}/admin/business-types`, icon: Store, permission: 'settings.manage' },
        { label: t('businessHours', 'Business Hours'), href: `${base}/admin/business-hours`, icon: Clock, permission: 'business_hours.manage' },
        { label: t('taxRules', 'Tax Rules'), href: `${base}/admin/tax-rules`, icon: Calculator, permission: 'tax_rules.manage' },
        { label: t('subscriptions', 'Subscriptions'), href: `${base}/admin/subscriptions`, icon: CreditCard, permission: 'subscriptions.view' },
        { label: t('hardware', 'Hardware'), href: `${base}/admin/hardware`, icon: Monitor, permission: 'hardware.manage' },
        { label: t('devices', 'Devices (Terminals)'), href: `${base}/admin/devices`, icon: Smartphone, permission: 'devices.view' },
        { label: t('notifications', 'Notifications'), href: `${base}/admin/notification-templates`, icon: Bell, permission: 'notifications.manage' },
        { label: t('branding', 'Branding'), href: `${base}/admin/advanced-branding`, icon: Palette, permission: 'branding.manage' },
        { label: t('multiCurrency', 'Multi-Currency'), href: `${base}/admin/multi-currency`, icon: DollarSign, permission: 'multi_currency.manage' },
        { label: t('holidays', 'Holidays'), href: `${base}/admin/holidays`, icon: CalendarDays, permission: 'holidays.manage' },
        { label: t('featureFlags', 'Feature Flags'), href: `${base}/admin/feature-flags`, icon: ToggleLeft, permission: 'feature_flags.manage' },
        { label: t('rolesPermissions', 'Roles & Permissions'), href: `${base}/admin/roles-permissions`, icon: Lock, permission: 'roles_permissions.manage' },
        { label: t('auditLogs', 'Audit Logs'), href: `${base}/admin/audit-logs`, icon: ClipboardList, permission: 'audit_logs.view' },
        { label: t('backupReset', 'Backup & Reset'), href: `${base}/admin/backup-reset`, icon: Database, permission: 'reset_collections.manage' },
        { label: t('sampleData', 'Sample Data'), href: `${base}/admin/sample-data`, icon: Sparkles, permission: 'sample_data.manage' },
        { label: t('apiDocs', 'API Docs'), href: `${base}/admin/api-docs`, icon: Code2, permission: 'api_docs.view' },
        { label: t('settings', 'Settings'), href: `${base}/admin/settings`, icon: Settings, permission: 'settings.manage' },
      ],
    },
  ];

  // Filter out items the current role can't see, then drop groups left with no items.
  const visibleNavGroups: NavGroup[] = navGroups
    .map(group => ({ ...group, items: group.items.filter(canSeeItem) }))
    .filter(group => group.items.length > 0);

  const isActive = (item: NavItem) => {
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
  };

  const isGroupActive = (group: NavGroup) => group.items.some(isActive);

  const STORAGE_KEY = 'admin-sidebar-groups';

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    // Seed from defaults
    const init: Record<string, boolean> = {};
    visibleNavGroups.forEach(g => { init[g.id] = g.defaultOpen ?? false; });

    // Override with persisted state if available
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, boolean>;
        Object.keys(parsed).forEach(id => { init[id] = parsed[id]; });
      }
    } catch { /* ignore */ }

    return init;
  });

  // Auto-open the group that contains the active page (but don't close others)
  useEffect(() => {
    setOpenGroups(prev => {
      const next = { ...prev };
      visibleNavGroups.forEach(g => {
        if (isGroupActive(g)) next[g.id] = true;
      });
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Persist open/closed state whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(openGroups));
    } catch { /* ignore */ }
  }, [openGroups]);

  const toggleGroup = (id: string) => {
    setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const roleLabel: Record<string, string> = {
    owner: t('roleOwner', 'Owner'),
    admin: t('roleAdmin', 'Admin'),
    manager: t('roleManager', 'Manager'),
    cashier: t('roleCashier', 'Cashier'),
    viewer: t('roleViewer', 'Viewer'),
    super_admin: t('roleSuperAdmin', 'Super Admin'),
  };
  const goToPosLabel = t('goToPos', 'Go to POS');
  const logoutLabel = t('logout', 'Logout');

  const SidebarContent = ({ collapsed }: { collapsed: boolean }) => (
    <div className="flex flex-col h-full">
      {/* User card */}
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
            style={{ backgroundColor: primaryColor }}
          >
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{user?.name || t('userFallback', 'User')}</p>
              <p className="text-xs text-gray-500 truncate">{roleLabel[user?.role ?? ''] || user?.role}</p>
            </div>
          )}
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {visibleNavGroups.map(group => {
          const groupActive = isGroupActive(group);
          const isOpen = openGroups[group.id];

          return (
            <div key={group.id} className="mb-1">
              {/* Group header */}
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={!!isOpen}
                  className={`w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                    groupActive ? 'text-gray-800' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  <span>{group.title}</span>
                  {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              )}

              {/* Items */}
              {(isOpen || collapsed) && (
                <ul className={collapsed ? 'mt-0' : 'mt-0.5'}>
                  {group.items.map(item => {
                    const active = isActive(item);
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={closeMobileSidebar}
                          title={collapsed ? item.label : undefined}
                          aria-label={collapsed ? item.label : undefined}
                          aria-current={active ? 'page' : undefined}
                          className={`flex items-center gap-2.5 px-2.5 py-2 text-sm transition-colors ${
                            active
                              ? 'font-semibold text-white'
                              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                          } ${collapsed ? 'justify-center' : ''}`}
                          style={active ? { backgroundColor: primaryColor } : undefined}
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" />
                          {!collapsed && <span className="truncate">{item.label}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Separator between groups in collapsed mode */}
              {collapsed && <div className="my-1 border-t border-gray-100" />}
            </div>
          );
        })}
      </nav>

      {/* Bottom: go to POS + logout */}
      <div className="border-t border-gray-100 p-2 space-y-1">
        <Link
          href={base}
          onClick={closeMobileSidebar}
          title={collapsed ? goToPosLabel : undefined}
          className={`flex items-center gap-2.5 px-2.5 py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors ${collapsed ? 'justify-center' : ''}`}
        >
          <Store className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>{goToPosLabel}</span>}
        </Link>
        <button
          onClick={logout}
          title={collapsed ? logoutLabel : undefined}
          aria-label={collapsed ? logoutLabel : undefined}
          className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-sm text-gray-600 hover:bg-win8-danger hover:text-white transition-colors ${collapsed ? 'justify-center' : ''}`}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          {!collapsed && <span>{logoutLabel}</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile overlay — below the fixed top bar */}
      {sidebarOpen && (
        <div
          className="fixed top-14 inset-x-0 bottom-0 bg-black/40 z-40 lg:hidden"
          onClick={closeMobileSidebar}
        />
      )}

      {/* Mobile drawer — slides in below the fixed top bar */}
      <aside
        className={`fixed top-14 left-0 bottom-0 w-64 bg-white border-r border-gray-300 z-50 transform transition-transform duration-200 lg:hidden overflow-hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent collapsed={false} />
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col fixed top-14 left-0 bottom-0 bg-white border-r border-gray-200 z-30 transition-all duration-200 ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        <SidebarContent collapsed={sidebarCollapsed} />
      </aside>
    </>
  );
}
