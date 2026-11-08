'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard, BarChart2, Package, Tag, Layers, Boxes, ArrowUpDown,
  Receipt, Percent, DollarSign, TrendingDown, Users, Heart, Megaphone,
  CalendarDays, LayoutGrid, UserCheck, ShieldCheck, Building2, FileText,
  UtensilsCrossed, ShoppingBag, WashingMachine, Briefcase, Pill, CalendarClock,
  Settings, Clock, Users2, GitBranch, Calculator, CreditCard, Monitor, Bell,
  Palette, ToggleLeft, ClipboardList, Database, ChevronDown, ChevronRight,
  LogOut, Store, ShoppingCart, Code2, Sparkles, Lock, Smartphone,
  PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import LedClock from '@/components/admin/LedClock';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import { useAdminLayout } from '@/contexts/AdminLayoutContext';
import { usePermissions } from '@/hooks/usePermissions';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  exact?: boolean;
  /** Permission key (see lib/permissions.ts) gating this item. Owner/admin/super_admin always see everything regardless. Omit for items visible to any admin-panel user. */
  permission?: string;
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

  // Owner/admin/super_admin always see every nav item, regardless of permission.
  const canSeeItem = (item: NavItem) => {
    if (!item.permission) return true;
    return canAccess(item.permission);
  };
  const { settings } = useTenantSettings();
  const { sidebarOpen, sidebarCollapsed, closeMobileSidebar, toggleCollapse, navT } = useAdminLayout();

  const primaryColor = (settings || getDefaultTenantSettings()).primaryColor || '#35979c';
  const businessName = settings?.companyName || tenant;

  const base = `/${tenant}/${lang}`;

  const navGroups: NavGroup[] = [
    {
      id: 'overview',
      title: navT('groupOverview', 'Overview'),
      defaultOpen: true,
      items: [
        { label: navT('dashboard', 'Dashboard'), href: `${base}/admin`, icon: LayoutDashboard, exact: true, permission: 'dashboard.view' },
        { label: navT('reports', 'Reports'), href: `${base}/admin/reports`, icon: BarChart2, permission: 'reports.view' },
      ],
    },
    {
      id: 'catalog',
      title: navT('groupCatalog', 'Catalog'),
      defaultOpen: true,
      items: [
        { label: navT('products', 'Products'), href: `${base}/admin/products`, icon: Package, permission: 'products.manage' },
        { label: navT('categories', 'Categories'), href: `${base}/admin/categories`, icon: Tag, permission: 'categories.manage' },
        { label: navT('bundles', 'Bundles'), href: `${base}/admin/bundles`, icon: Layers, permission: 'bundles.manage' },
        { label: navT('inventory', 'Inventory'), href: `${base}/admin/inventory`, icon: Boxes, permission: 'inventory.manage' },
        { label: navT('stockMovements', 'Stock Movements'), href: `${base}/admin/stock-movements`, icon: ArrowUpDown, permission: 'stock_movements.manage' },
      ],
    },
    {
      id: 'sales',
      title: navT('groupSales', 'Sales'),
      defaultOpen: true,
      items: [
        { label: navT('transactions', 'Transactions'), href: `${base}/admin/transactions`, icon: Receipt, permission: 'transactions.view' },
        { label: navT('discounts', 'Discounts'), href: `${base}/admin/discounts`, icon: Percent, permission: 'discounts.manage' },
        { label: navT('cashDrawer', 'Cash Drawer'), href: `${base}/admin/cash-drawer`, icon: DollarSign, permission: 'cash_drawer.manage' },
        { label: navT('expenses', 'Expenses'), href: `${base}/admin/expenses`, icon: TrendingDown, permission: 'expenses.manage' },
      ],
    },
    {
      id: 'customers',
      title: navT('groupCustomers', 'Customers'),
      defaultOpen: false,
      items: [
        { label: navT('customers', 'Customers'), href: `${base}/admin/customers`, icon: Users, permission: 'customers.manage' },
        { label: navT('loyalty', 'Loyalty'), href: `${base}/admin/loyalty`, icon: Heart, permission: 'loyalty.manage' },
        { label: navT('crm', 'CRM'), href: `${base}/admin/crm`, icon: Megaphone, permission: 'crm.manage' },
      ],
    },
    {
      id: 'operations',
      title: navT('groupOperations', 'Operations'),
      defaultOpen: false,
      items: [
        { label: navT('bookings', 'Bookings'), href: `${base}/admin/bookings`, icon: CalendarDays, permission: 'bookings.manage' },
        { label: navT('tables', 'Tables'), href: `${base}/admin/tables`, icon: LayoutGrid, permission: 'tables.manage' },
        { label: navT('attendance', 'Attendance'), href: `${base}/admin/attendance`, icon: UserCheck, permission: 'attendance.manage' },
        { label: navT('channelOrders', 'Channel Orders'), href: `${base}/admin/channel-orders`, icon: ShoppingCart, permission: 'integrations.manage' },
      ],
    },
    {
      id: 'compliance',
      title: navT('groupCompliance', 'Compliance'),
      defaultOpen: false,
      items: [
        { label: navT('complianceStatus', 'Compliance Status'), href: `${base}/admin/compliance`, icon: ShieldCheck, permission: 'compliance.view' },
        { label: navT('businessPermits', 'Business Permits'), href: `${base}/admin/business-permits`, icon: Building2, permission: 'business_permits.manage' },
        { label: navT('birCompliance', 'BIR Compliance'), href: `${base}/admin/bir-compliance`, icon: FileText, permission: 'bir_compliance.manage' },
        { label: navT('restaurant', 'Restaurant'), href: `${base}/admin/restaurant-compliance`, icon: UtensilsCrossed, permission: 'restaurant_compliance.manage' },
        { label: navT('retail', 'Retail'), href: `${base}/admin/retail-compliance`, icon: ShoppingBag, permission: 'retail_compliance.manage' },
        { label: navT('laundry', 'Laundry'), href: `${base}/admin/laundry-compliance`, icon: WashingMachine, permission: 'laundry_compliance.manage' },
        { label: navT('service', 'Service'), href: `${base}/admin/service-compliance`, icon: Briefcase, permission: 'service_compliance.manage' },
        { label: navT('pharmacy', 'Pharmacy'), href: `${base}/admin/pharmacy-compliance`, icon: Pill, permission: 'pharmacy_compliance.manage' },
        { label: navT('prescriptions', 'Prescriptions'), href: `${base}/admin/prescriptions`, icon: FileText, permission: 'prescriptions.manage' },
        { label: navT('expiryTracking', 'Expiry Tracking'), href: `${base}/admin/expiry-tracking`, icon: CalendarClock, permission: 'expiry_tracking.manage' },
      ],
    },
    {
      id: 'configuration',
      title: navT('groupConfiguration', 'Configuration'),
      defaultOpen: false,
      items: [
        { label: navT('users', 'Users'), href: `${base}/admin/users`, icon: Users2, permission: 'users.manage' },
        { label: navT('branches', 'Branches'), href: `${base}/admin/branches`, icon: GitBranch, permission: 'branches.manage' },
        { label: navT('businessType', 'Business Type'), href: `${base}/admin/business-types`, icon: Store, permission: 'settings.manage' },
        { label: navT('businessHours', 'Business Hours'), href: `${base}/admin/business-hours`, icon: Clock, permission: 'business_hours.manage' },
        { label: navT('taxRules', 'Tax Rules'), href: `${base}/admin/tax-rules`, icon: Calculator, permission: 'tax_rules.manage' },
        { label: navT('subscriptions', 'Subscriptions'), href: `${base}/admin/subscriptions`, icon: CreditCard, permission: 'subscriptions.manage' },
        { label: navT('hardware', 'Hardware'), href: `${base}/admin/hardware`, icon: Monitor, permission: 'settings.manage' },
        { label: navT('devices', 'Devices (Terminals)'), href: `${base}/admin/devices`, icon: Smartphone, permission: 'devices.manage' },
        { label: navT('notifications', 'Notifications'), href: `${base}/admin/notification-templates`, icon: Bell, permission: 'notifications.manage' },
        { label: navT('branding', 'Branding'), href: `${base}/admin/advanced-branding`, icon: Palette, permission: 'settings.manage' },
        { label: navT('multiCurrency', 'Multi-Currency'), href: `${base}/admin/multi-currency`, icon: DollarSign, permission: 'settings.manage' },
        { label: navT('holidays', 'Holidays'), href: `${base}/admin/holidays`, icon: CalendarDays, permission: 'holidays.manage' },
        { label: navT('featureFlags', 'Feature Flags'), href: `${base}/admin/feature-flags`, icon: ToggleLeft, permission: 'settings.manage' },
        { label: navT('rolesPermissions', 'Roles & Permissions'), href: `${base}/admin/roles-permissions`, icon: Lock, permission: 'roles_permissions.manage' },
        { label: navT('auditLogs', 'Audit Logs'), href: `${base}/admin/audit-logs`, icon: ClipboardList, permission: 'audit_logs.view' },
        { label: navT('backupReset', 'Backup & Reset'), href: `${base}/admin/backup-reset`, icon: Database, permission: 'reset_collections.manage' },
        { label: navT('sampleData', 'Sample Data'), href: `${base}/admin/sample-data`, icon: Sparkles, permission: 'sample_data.manage' },
        { label: navT('apiDocs', 'API Docs'), href: `${base}/admin/api-docs`, icon: Code2, permission: 'api_docs.view' },
        { label: navT('settings', 'Settings'), href: `${base}/admin/settings`, icon: Settings, permission: 'settings.manage' },
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
    owner: navT('roleOwner', 'Owner'),
    admin: navT('roleAdmin', 'Admin'),
    manager: navT('roleManager', 'Manager'),
    cashier: navT('roleCashier', 'Cashier'),
    viewer: navT('roleViewer', 'Viewer'),
    super_admin: navT('roleSuperAdmin', 'Super Admin'),
  };

  const collapseKey = (
    <button
      onClick={toggleCollapse}
      className="flex flex-shrink-0 items-center justify-center border border-white/15 text-paper/60 hover:bg-white/10 hover:text-paper-white focus-visible:outline-2 focus-visible:outline-[#8fe3d0]"
      aria-label={navT('toggleSidebar', 'Toggle sidebar')}
      aria-expanded={!sidebarCollapsed}
    >
      {sidebarCollapsed
        ? <PanelLeftOpen className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        : <PanelLeftClose className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
    </button>
  );

  const SidebarContent = ({ collapsed, desktop = false }: { collapsed: boolean; desktop?: boolean }) => (
    <div className="flex h-full flex-col font-body">
      {/* Brand, clock and collapse key. Desktop only: on phones the top bar carries the brand. */}
      {desktop && (
        <div className={`border-b-2 border-[#8fe3d0]/60 bg-ink ${collapsed ? 'px-2 py-3' : 'px-4 pb-3 pt-4'}`}>
          <div className={`flex items-center gap-2.5 ${collapsed ? 'flex-col' : ''}`}>
            <div
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center font-display text-xl font-extrabold uppercase leading-none text-white"
              style={{ backgroundColor: primaryColor }}
              title={collapsed ? businessName : undefined}
            >
              {businessName.charAt(0).toUpperCase()}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1 leading-none">
                <p className="truncate font-display text-2xl font-extrabold uppercase leading-none text-paper-white">
                  {businessName}
                </p>
                <p className="mt-1 truncate font-receipt text-[10px] uppercase tracking-[0.18em] text-[#8fe3d0]">
                  {navT('console', 'Back office · Console')}
                </p>
              </div>
            )}
            {collapsed && collapseKey}
          </div>
          {!collapsed && (
            <div className="mt-3 flex items-stretch gap-2">
              <LedClock lang={lang} className="min-w-0 flex-1" />
              {collapseKey}
            </div>
          )}
        </div>
      )}

      {/* Operator on shift */}
      <div className={`border-b border-dashed border-white/15 py-4 ${collapsed ? 'px-3' : 'px-4'}`}>
        <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
          <div
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center font-receipt text-sm font-semibold text-white"
            style={{ backgroundColor: primaryColor }}
          >
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-receipt text-[10px] uppercase tracking-[0.18em] text-[#8fe3d0]">{navT('operator', 'Operator')}</p>
              <p className="truncate text-sm font-semibold text-paper-white">{user?.name || 'User'}</p>
              <p className="truncate font-receipt text-[11px] uppercase tracking-[0.1em] text-paper/55">
                {roleLabel[user?.role ?? ''] || user?.role}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Nav groups, numbered like keys on a function panel */}
      <nav className="flex-1 [scrollbar-color:rgb(255_255_255/0.2)_transparent] [scrollbar-width:thin] overflow-y-auto px-2 py-3" aria-label={navT('navLabel', 'Admin')}>
        {visibleNavGroups.map((group, index) => {
          const groupActive = isGroupActive(group);
          const isOpen = openGroups[group.id];
          const no = String(index + 1).padStart(2, '0');

          return (
            <div key={group.id} className="mb-1">
              {!collapsed && (
                <button
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={!!isOpen}
                  className={`flex w-full items-center gap-2 px-2 font-receipt text-[11px] font-medium uppercase tracking-[0.14em] transition-colors lg:min-h-9! focus-visible:outline-2 focus-visible:outline-[#8fe3d0] ${
                    groupActive ? 'text-[#8fe3d0]' : 'text-paper/45 hover:text-paper/80'
                  }`}
                >
                  <span>{no}</span>
                  <span>{group.title}</span>
                  <span className="mk-leader" aria-hidden />
                  {isOpen
                    ? <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.75} aria-hidden />
                    : <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.75} aria-hidden />}
                </button>
              )}

              {(isOpen || collapsed) && (
                <ul className={collapsed ? 'mt-0' : 'mb-2 mt-0.5'}>
                  {group.items.map(item => {
                    const active = isActive(item);
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={closeMobileSidebar}
                          title={collapsed ? item.label : undefined}
                          aria-current={active ? 'page' : undefined}
                          className={`flex items-center gap-2.5 border-l-4 px-2.5 text-sm transition-colors lg:min-h-10! focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#8fe3d0] ${
                            active
                              ? 'bg-paper-white font-semibold text-ink'
                              : 'border-transparent text-paper/75 hover:bg-white/[0.06] hover:text-paper-white'
                          } ${collapsed ? 'justify-center' : ''}`}
                          style={active ? { borderLeftColor: primaryColor } : undefined}
                        >
                          <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} aria-hidden />
                          {!collapsed && <span className="truncate">{item.label}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}

              {collapsed && <div className="my-1 border-t border-dashed border-white/15" />}
            </div>
          );
        })}
      </nav>

      {/* Leave the back office */}
      <div className="space-y-1 border-t border-dashed border-white/15 p-2">
        <Link
          href={base}
          onClick={closeMobileSidebar}
          title={collapsed ? navT('goToPos', 'Go to POS') : undefined}
          className={`flex items-center gap-2.5 bg-[#8fe3d0] px-2.5 text-sm font-semibold uppercase tracking-wide text-ink transition-colors hover:bg-[#7df0d6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8fe3d0] ${collapsed ? 'justify-center' : ''}`}
        >
          <Store className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} aria-hidden />
          {!collapsed && <span className="font-receipt text-xs tracking-[0.12em]">{navT('goToPos', 'Go to POS')}</span>}
        </Link>
        <button
          onClick={logout}
          title={collapsed ? navT('logout', 'Logout') : undefined}
          className={`flex w-full items-center gap-2.5 px-2.5 text-sm text-paper/70 transition-colors hover:bg-stamp hover:text-paper-white focus-visible:outline-2 focus-visible:outline-[#8fe3d0] ${collapsed ? 'justify-center' : ''}`}
        >
          <LogOut className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} aria-hidden />
          {!collapsed && <span className="font-receipt text-xs uppercase tracking-[0.12em]">{navT('logout', 'Logout')}</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile overlay — below the fixed top bar */}
      {sidebarOpen && (
        <div
          className="fixed inset-x-0 bottom-0 top-14 z-40 bg-ink/60 lg:hidden"
          onClick={closeMobileSidebar}
        />
      )}

      {/* Mobile drawer — slides in below the fixed top bar */}
      <aside
        className={`fixed bottom-0 left-0 top-14 z-50 w-64 transform overflow-hidden bg-brand-navy-deep text-paper transition-transform duration-200 lg:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent collapsed={false} />
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={`fixed bottom-0 left-0 top-0 z-30 hidden flex-col bg-brand-navy-deep text-paper transition-all duration-200 lg:flex ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        <SidebarContent collapsed={sidebarCollapsed} desktop />
      </aside>
    </>
  );
}
