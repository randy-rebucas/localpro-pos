'use client';

import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import {
  BarChart3,
  Package,
  Tags,
  Boxes,
  Percent,
  Users,
  Star,
  Mail,
  CreditCard,
  DollarSign,
  Banknote,
  Wallet,
  TrendingDown,
  Grid3x3,
  Calendar,
  Clock,
  TrendingUp,
  Lock,
  Building2,
  MapPin,
  Settings,
  ArrowLeft,
  Bell,
  Calculator,
  Briefcase,
  RefreshCw,
  Palette,
  Monitor,
  Upload,
  History,
  Shield,
  Code,
  ToggleRight,
  Database,
  Zap,
  MessageSquare,
  BookOpen,
} from 'lucide-react';

interface AdminSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

// Icon mapping by href for easy lookup
const iconMap: Record<string, React.ReactNode> = {
  '/admin': <BarChart3 className="w-5 h-5" />,
  '/admin/products': <Package className="w-5 h-5" />,
  '/admin/categories': <Tags className="w-5 h-5" />,
  '/admin/bundles': <Boxes className="w-5 h-5" />,
  '/admin/discounts': <Percent className="w-5 h-5" />,
  '/admin/customers': <Users className="w-5 h-5" />,
  '/admin/loyalty': <Star className="w-5 h-5" />,
  '/admin/crm': <Mail className="w-5 h-5" />,
  '/admin/transactions': <CreditCard className="w-5 h-5" />,
  '/admin/receivables': <DollarSign className="w-5 h-5" />,
  '/admin/credits': <Banknote className="w-5 h-5" />,
  '/admin/cash-drawer': <Wallet className="w-5 h-5" />,
  '/admin/expenses': <TrendingDown className="w-5 h-5" />,
  '/admin/tables': <Grid3x3 className="w-5 h-5" />,
  '/admin/bookings': <Calendar className="w-5 h-5" />,
  '/admin/stock-movements': <BarChart3 className="w-5 h-5" />,
  '/admin/attendance': <Clock className="w-5 h-5" />,
  '/admin/attendance/notifications': <Bell className="w-5 h-5" />,
  '/reports': <TrendingUp className="w-5 h-5" />,
  '/admin/users': <Lock className="w-5 h-5" />,
  '/admin/tenants': <Building2 className="w-5 h-5" />,
  '/admin/branches': <MapPin className="w-5 h-5" />,
  '/admin/business-hours': <Clock className="w-5 h-5" />,
  '/admin/holidays': <Calendar className="w-5 h-5" />,
  '/admin/tax-rules': <Calculator className="w-5 h-5" />,
  '/admin/business-types': <Briefcase className="w-5 h-5" />,
  '/admin/multi-currency': <DollarSign className="w-5 h-5" />,
  '/admin/notification-templates': <MessageSquare className="w-5 h-5" />,
  '/admin/feature-flags': <ToggleRight className="w-5 h-5" />,
  '/admin/sample-data': <Database className="w-5 h-5" />,
  '/admin/advanced-branding': <Palette className="w-5 h-5" />,
  '/admin/hardware': <Monitor className="w-5 h-5" />,
  '/admin/file-upload': <Upload className="w-5 h-5" />,
  '/admin/audit-logs': <History className="w-5 h-5" />,
  '/admin/backup-reset': <RefreshCw className="w-5 h-5" />,
  '/admin/bir-compliance': <Shield className="w-5 h-5" />,
  '/admin/api-docs': <Code className="w-5 h-5" />,
  '/admin/subscriptions': <Zap className="w-5 h-5" />,
};

const navigationSections = [
  {
    title: 'Store Operations',
    items: [
      { name: 'Dashboard', href: '/admin' },
      { name: 'Products', href: '/admin/products' },
      { name: 'Categories', href: '/admin/categories' },
      { name: 'Bundles', href: '/admin/bundles' },
      { name: 'Discounts', href: '/admin/discounts' },
      { name: 'Customers', href: '/admin/customers' },
      { name: 'Loyalty Program', href: '/admin/loyalty' },
      { name: 'CRM', href: '/admin/crm' },
      { name: 'Transactions', href: '/admin/transactions' },
      { name: 'Receivables', href: '/admin/receivables' },
      { name: 'Credits', href: '/admin/credits' },
      { name: 'Cash Drawer', href: '/admin/cash-drawer' },
      { name: 'Expenses', href: '/admin/expenses' },
      { name: 'Tables', href: '/admin/tables' },
      { name: 'Bookings', href: '/admin/bookings' },
    ],
  },
  {
    title: 'Inventory & Stock',
    items: [
      { name: 'Stock Movements', href: '/admin/stock-movements' },
    ],
  },
  {
    title: 'Staff & HR',
    items: [
      { name: 'Attendance', href: '/admin/attendance' },
      { name: 'Attendance Notifications', href: '/admin/attendance/notifications' },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { name: 'Business Hours', href: '/admin/business-hours' },
      { name: 'Holiday Calendar', href: '/admin/holidays' },
      { name: 'Tax Rules', href: '/admin/tax-rules' },
      { name: 'Business Types', href: '/admin/business-types' },
      { name: 'Multi-Currency', href: '/admin/multi-currency' },
      { name: 'Notification Templates', href: '/admin/notification-templates' },
    ],
  },
  {
    title: 'Marketing & Growth',
    items: [
      { name: 'Feature Flags', href: '/admin/feature-flags' },
      { name: 'Sample Data', href: '/admin/sample-data' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { name: 'Branding', href: '/admin/advanced-branding' },
      { name: 'Hardware', href: '/admin/hardware' },
      { name: 'File Upload', href: '/admin/file-upload' },
      { name: 'Audit Logs', href: '/admin/audit-logs' },
      { name: 'Backup & Reset', href: '/admin/backup-reset' },
      { name: 'BIR Compliance', href: '/admin/bir-compliance' },
      { name: 'API Documentation', href: '/admin/api-docs' },
    ],
  },
  {
    title: 'System',
    items: [
      { name: 'Users', href: '/admin/users' },
      { name: 'Subscription', href: '/admin/subscriptions' },
      { name: 'Tenants', href: '/admin/tenants' },
      { name: 'Branches', href: '/admin/branches' },
    ],
  },
];

export default function AdminSidebar({ isOpen, onToggle }: AdminSidebarProps) {
  const params = useParams();
  const pathname = usePathname();
  const tenant = params.tenant as string;
  const lang = params.lang as string;
  const { settings } = useTenantSettings();
  const primaryColor = (settings || getDefaultTenantSettings()).primaryColor || '#3b82f6';

  const isActive = (href: string) => {
    const fullHref = `/${tenant}/${lang}${href}`;
    // For dashboard, only match exact path (not prefix)
    if (href === '/admin') {
      return pathname === fullHref;
    }
    // For other pages, match exact or with sub-paths
    return pathname === fullHref || pathname.startsWith(fullHref + '/');
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-gray-900/50 lg:hidden z-40"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out z-40 lg:relative lg:translate-x-0 overflow-y-auto ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo/Brand Area */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                style={{ backgroundColor: primaryColor }}
              >
                <Settings className="w-5 h-5" />
              </div>
              <h1 className="text-lg font-bold text-gray-900">Admin</h1>
            </div>
            {/* Close button for mobile */}
            <button
              onClick={onToggle}
              className="lg:hidden p-1 hover:bg-gray-100 rounded-md transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-8">
          {navigationSections.map((section) => (
            <div key={section.title}>
              <h3 className="px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                {section.title}
              </h3>
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={`/${tenant}/${lang}${item.href}`}
                        className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 border-l-4 ${
                          active
                            ? 'text-white border-white'
                            : 'text-gray-700 hover:bg-gray-100 border-transparent'
                        }`}
                        style={
                          active
                            ? { backgroundColor: primaryColor }
                            : {}
                        }
                        onClick={() => {
                          // Close sidebar on mobile after navigation
                          if (window.innerWidth < 1024) {
                            onToggle();
                          }
                        }}
                      >
                        {iconMap[item.href]}
                        <span>{item.name}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 mt-auto">
          <Link
            href={`/${tenant}/${lang}`}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to POS
          </Link>
        </div>
      </aside>
    </>
  );
}
