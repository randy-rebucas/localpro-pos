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
  LogOut, Store, ShoppingCart, Code2, Sparkles, Lock
} from 'lucide-react';
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
  const { sidebarOpen, sidebarCollapsed, closeMobileSidebar } = useAdminLayout();

  const primaryColor = (settings || getDefaultTenantSettings()).primaryColor || '#35979c';

  const base = `/${tenant}/${lang}`;

  const navGroups: NavGroup[] = [
    {
      id: 'overview',
      title: 'Overview',
      defaultOpen: true,
      items: [
        { label: 'Dashboard', href: `${base}/admin`, icon: LayoutDashboard, exact: true, permission: 'dashboard.view' },
        { label: 'Reports', href: `${base}/admin/reports`, icon: BarChart2, permission: 'reports.view' },
      ],
    },
    {
      id: 'catalog',
      title: 'Catalog',
      defaultOpen: true,
      items: [
        { label: 'Products', href: `${base}/admin/products`, icon: Package, permission: 'products.manage' },
        { label: 'Categories', href: `${base}/admin/categories`, icon: Tag, permission: 'categories.manage' },
        { label: 'Bundles', href: `${base}/admin/bundles`, icon: Layers, permission: 'bundles.manage' },
        { label: 'Inventory', href: `${base}/admin/inventory`, icon: Boxes, permission: 'inventory.manage' },
        { label: 'Stock Movements', href: `${base}/admin/stock-movements`, icon: ArrowUpDown, permission: 'stock_movements.manage' },
      ],
    },
    {
      id: 'sales',
      title: 'Sales',
      defaultOpen: true,
      items: [
        { label: 'Transactions', href: `${base}/admin/transactions`, icon: Receipt, permission: 'transactions.view' },
        { label: 'Discounts', href: `${base}/admin/discounts`, icon: Percent, permission: 'discounts.manage' },
        { label: 'Cash Drawer', href: `${base}/admin/cash-drawer`, icon: DollarSign, permission: 'cash_drawer.manage' },
        { label: 'Expenses', href: `${base}/admin/expenses`, icon: TrendingDown, permission: 'expenses.manage' },
      ],
    },
    {
      id: 'customers',
      title: 'Customers',
      defaultOpen: false,
      items: [
        { label: 'Customers', href: `${base}/admin/customers`, icon: Users, permission: 'customers.manage' },
        { label: 'Loyalty', href: `${base}/admin/loyalty`, icon: Heart, permission: 'loyalty.manage' },
        { label: 'CRM', href: `${base}/admin/crm`, icon: Megaphone, permission: 'crm.manage' },
      ],
    },
    {
      id: 'operations',
      title: 'Operations',
      defaultOpen: false,
      items: [
        { label: 'Bookings', href: `${base}/admin/bookings`, icon: CalendarDays, permission: 'bookings.manage' },
        { label: 'Tables', href: `${base}/admin/tables`, icon: LayoutGrid, permission: 'tables.manage' },
        { label: 'Attendance', href: `${base}/admin/attendance`, icon: UserCheck, permission: 'attendance.manage' },
        { label: 'Channel Orders', href: `${base}/admin/channel-orders`, icon: ShoppingCart, permission: 'channel_orders.manage' },
      ],
    },
    {
      id: 'compliance',
      title: 'Compliance',
      defaultOpen: false,
      items: [
        { label: 'Compliance Status', href: `${base}/admin/compliance`, icon: ShieldCheck, permission: 'compliance.view' },
        { label: 'Business Permits', href: `${base}/admin/business-permits`, icon: Building2, permission: 'business_permits.manage' },
        { label: 'BIR Compliance', href: `${base}/admin/bir-compliance`, icon: FileText, permission: 'bir_compliance.manage' },
        { label: 'Restaurant', href: `${base}/admin/restaurant-compliance`, icon: UtensilsCrossed, permission: 'restaurant_compliance.manage' },
        { label: 'Retail', href: `${base}/admin/retail-compliance`, icon: ShoppingBag, permission: 'retail_compliance.manage' },
        { label: 'Laundry', href: `${base}/admin/laundry-compliance`, icon: WashingMachine, permission: 'laundry_compliance.manage' },
        { label: 'Service', href: `${base}/admin/service-compliance`, icon: Briefcase, permission: 'service_compliance.manage' },
        { label: 'Pharmacy', href: `${base}/admin/pharmacy-compliance`, icon: Pill, permission: 'pharmacy_compliance.manage' },
        { label: 'Prescriptions', href: `${base}/admin/prescriptions`, icon: FileText, permission: 'prescriptions.manage' },
        { label: 'Expiry Tracking', href: `${base}/admin/expiry-tracking`, icon: CalendarClock, permission: 'expiry_tracking.manage' },
      ],
    },
    {
      id: 'configuration',
      title: 'Configuration',
      defaultOpen: false,
      items: [
        { label: 'Users', href: `${base}/admin/users`, icon: Users2, permission: 'users.manage' },
        { label: 'Branches', href: `${base}/admin/branches`, icon: GitBranch, permission: 'branches.manage' },
        { label: 'Business Type', href: `${base}/admin/business-types`, icon: Store, permission: 'business_types.manage' },
        { label: 'Business Hours', href: `${base}/admin/business-hours`, icon: Clock, permission: 'business_hours.manage' },
        { label: 'Tax Rules', href: `${base}/admin/tax-rules`, icon: Calculator, permission: 'tax_rules.manage' },
        { label: 'Subscriptions', href: `${base}/admin/subscriptions`, icon: CreditCard, permission: 'subscriptions.manage' },
        { label: 'Hardware', href: `${base}/admin/hardware`, icon: Monitor, permission: 'hardware.manage' },
        { label: 'Notifications', href: `${base}/admin/notification-templates`, icon: Bell, permission: 'notifications.manage' },
        { label: 'Branding', href: `${base}/admin/advanced-branding`, icon: Palette, permission: 'branding.manage' },
        { label: 'Multi-Currency', href: `${base}/admin/multi-currency`, icon: DollarSign, permission: 'multi_currency.manage' },
        { label: 'Holidays', href: `${base}/admin/holidays`, icon: CalendarDays, permission: 'holidays.manage' },
        { label: 'Feature Flags', href: `${base}/admin/feature-flags`, icon: ToggleLeft, permission: 'feature_flags.manage' },
        { label: 'Roles & Permissions', href: `${base}/admin/roles-permissions`, icon: Lock, permission: 'roles_permissions.manage' },
        { label: 'Audit Logs', href: `${base}/admin/audit-logs`, icon: ClipboardList, permission: 'audit_logs.view' },
        { label: 'Backup & Reset', href: `${base}/admin/backup-reset`, icon: Database, permission: 'backup_reset.manage' },
        { label: 'Sample Data', href: `${base}/admin/sample-data`, icon: Sparkles, permission: 'sample_data.manage' },
        { label: 'API Docs', href: `${base}/admin/api-docs`, icon: Code2, permission: 'api_docs.view' },
        { label: 'Settings', href: `${base}/admin/settings`, icon: Settings, permission: 'settings.manage' },
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
    owner: 'Owner',
    admin: 'Admin',
    manager: 'Manager',
    cashier: 'Cashier',
    viewer: 'Viewer',
    super_admin: 'Super Admin',
  };

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
              <p className="text-sm font-semibold text-gray-900 truncate">{user?.name || 'User'}</p>
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
                  onClick={() => toggleGroup(group.id)}
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
          title={collapsed ? 'Go to POS' : undefined}
          className={`flex items-center gap-2.5 px-2.5 py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors ${collapsed ? 'justify-center' : ''}`}
        >
          <Store className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Go to POS</span>}
        </Link>
        <button
          onClick={logout}
          title={collapsed ? 'Logout' : undefined}
          className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-sm text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors ${collapsed ? 'justify-center' : ''}`}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
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
        className={`fixed top-14 left-0 bottom-0 w-64 bg-white border-r border-gray-200 shadow-xl z-50 transform transition-transform duration-200 lg:hidden overflow-hidden ${
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
