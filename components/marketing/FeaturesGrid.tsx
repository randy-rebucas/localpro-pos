'use client';

import { useState } from 'react';
import {
  Banknote, Boxes, Building2, CalendarClock, ChartColumn, Check, Clock, Coins, Languages, Package, PackagePlus, Plus,
  Printer, ReceiptText, Settings2, Shapes, ShieldCheck, ShoppingCart, Store, TicketPercent, UserRound, UsersRound,
  Wallet, WifiOff, Workflow,
} from 'lucide-react';

type Category = 'all' | 'pos' | 'inventory' | 'customers' | 'analytics' | 'platform';

const features = [
  // ── Point of Sale ──────────────────────────────────────────────────
  { id: 'core-pos', category: 'pos' as Category, title: 'Core POS', icon: ShoppingCart, description: 'Complete point of sale interface with shopping cart, payments, and receipts', details: ['Shopping cart with real-time calculations', 'Product search & filtering by name, SKU, or barcode', 'Real-time stock validation', 'Multiple payment methods (Cash, Card, Digital Wallet)', 'Customizable receipt generation (PDF, Print, Email)', 'Transaction management with full history', 'Refund processing with stock restoration'] },
  { id: 'discounts', category: 'pos' as Category, title: 'Discounts & Promos', icon: TicketPercent, description: 'Flexible discount codes with usage limits and validity periods', details: ['Percentage and fixed amount discounts', 'Product, category, or store-wide discounts', 'Minimum purchase requirements', 'Usage limits per code and per customer', 'Validity periods with start/end dates', 'Real-time discount validation'] },
  { id: 'tax', category: 'pos' as Category, title: 'Tax & BIR Compliance', icon: ReceiptText, description: 'BIR-ready tax configuration with VAT computation and official receipt generation', details: ['Flat rate and percentage-based taxes', 'BIR-compliant official receipts (OR)', 'Custom tax labels (VAT, GST, Sales Tax)', 'Multiple tax rules with priority ordering', 'Automatic VAT calculation', 'CAS reporting for BIR audit'] },
  { id: 'cash-drawer', category: 'pos' as Category, title: 'Cash Drawer', icon: Banknote, description: 'Cash drawer sessions with opening/closing amounts and reconciliation', details: ['Opening cash drawer with starting amount', 'Closing cash drawer with count', 'Shortage/overage detection', 'Cash sales and expenses tracking', 'Session history and reports', 'Auto-close at end of day'] },
  { id: 'currency', category: 'pos' as Category, title: 'Multi-Currency', icon: Coins, description: 'Support for multiple currencies with automatic exchange rates', details: ['Base currency per tenant', 'Display currencies', 'Automatic exchange rate fetching', 'Multiple exchange rate providers', 'Real-time currency conversion', 'Multi-currency reporting'] },
  // ── Inventory ──────────────────────────────────────────────────────
  { id: 'product-management', category: 'inventory' as Category, title: 'Product Management', icon: Package, description: 'Comprehensive product management with variations, bundles, and barcode support', details: ['Full CRUD operations for products', 'Product categories and organization', 'SKU tracking and management', 'Product variations (size, color, type)', 'Product bundles with automatic stock deduction', 'Barcode & QR code scanning and generation', 'Product images and descriptions'] },
  { id: 'inventory', category: 'inventory' as Category, title: 'Inventory Tracking', icon: Boxes, description: 'Real-time inventory tracking with multi-branch support and low stock alerts', details: ['Real-time stock updates via Server-Sent Events', 'Complete stock movement history', 'Multi-branch inventory with transfers', 'Low stock alerts and notifications', 'Stock movement types: Sale, Purchase, Adjustment, Return, Damage, Transfer', 'Automated stock deduction on sales'] },
  { id: 'branches', category: 'inventory' as Category, title: 'Branch Management', icon: Store, description: 'Multi-branch support with branch-specific inventory and reporting', details: ['Create and manage multiple branches', 'Branch-specific stock levels', 'Stock transfers between branches', 'Branch-specific reports', 'Cross-branch comparisons', 'Consolidated reporting'] },
  { id: 'bundles', category: 'inventory' as Category, title: 'Product Bundles', icon: PackagePlus, description: 'Product bundles with automatic stock management and analytics', details: ['Create and manage product bundles', 'Bundle-specific pricing', 'Automatic stock deduction for all bundle items', 'Bundle performance tracking', 'Component product analysis', 'Bulk bundle operations'] },
  { id: 'expenses', category: 'inventory' as Category, title: 'Expense Management', icon: Wallet, description: 'Track expenses with categories, receipts, and integration with P&L reports', details: ['Expense categories and organization', 'Receipt attachments', 'Payment method tracking', 'Date-based filtering', 'Integration with profit/loss reports', 'Category-wise expense breakdown'] },
  { id: 'hardware', category: 'inventory' as Category, title: 'Hardware Integration', icon: Printer, description: 'Support for barcode scanners, QR code scanners, and receipt printers', details: ['USB and wireless barcode scanners', 'Camera-based QR code scanning', 'ESC/POS compatible receipt printers', 'Per-tenant hardware configuration', 'Hardware status monitoring', 'Connection error handling'] },
  // ── Customers ──────────────────────────────────────────────────────
  { id: 'customers', category: 'customers' as Category, title: 'Customer Management', icon: UserRound, description: 'Comprehensive customer profiles with analytics and lifetime value tracking', details: ['Customer information and contact details', 'Multiple addresses per customer', 'Customer tags and categorization', 'Purchase history and analytics', 'Customer lifetime value calculation', 'Customer notes and preferences'] },
  { id: 'booking', category: 'customers' as Category, title: 'Booking & Scheduling', icon: CalendarClock, description: 'Calendar-based booking system with reminders and status management', details: ['Calendar views (Month, Week, Day)', 'Create, edit, cancel, and delete bookings', 'Customer and service information', 'Staff assignment', 'Booking status management', 'Automated reminders (24h before)', 'Conflict detection'] },
  { id: 'user-management', category: 'customers' as Category, title: 'User Management', icon: UsersRound, description: 'Flexible authentication with role-based access control', details: ['Email/Password authentication', 'PIN-based login (4-6 digits)', 'QR code-based login', 'Role-based access control (Owner, Admin, Manager, Cashier, Viewer)', 'User profiles with activity tracking', 'Session management with JWT tokens'] },
  { id: 'attendance', category: 'customers' as Category, title: 'Attendance', icon: Clock, description: 'Time tracking with clock in/out, breaks, and location tracking', details: ['Clock in/out functionality', 'Break tracking (start/end)', 'Automatic hours calculation', 'Attendance history and records', 'GPS location capture (optional)', 'Auto clock-out for forgotten sessions'] },
  // ── Analytics ──────────────────────────────────────────────────────
  { id: 'reports', category: 'analytics' as Category, title: 'Reports & Analytics', icon: ChartColumn, description: 'Comprehensive reporting with sales, product, financial, and attendance analytics', details: ['Sales reports (Daily, Weekly, Monthly, Custom)', 'Product performance and analytics', 'Financial reports (Profit & Loss)', 'VAT/Tax reports', 'Cash drawer session reports', 'Bundle performance reports', 'Export capabilities (CSV, Excel, PDF)'] },
  { id: 'automations', category: 'analytics' as Category, title: 'Automations', icon: Workflow, description: 'Seven core automated workflows today — expandable per tenant', details: ['Automated booking reminders', 'Low stock alerts', 'Transaction receipt auto-email', 'Scheduled reports', 'Auto clock-out for attendance', 'Cash drawer auto-close', 'Customer welcome emails'] },
  // ── Platform ───────────────────────────────────────────────────────
  { id: 'multi-tenant', category: 'platform' as Category, title: 'Multi-Tenant', icon: Building2, description: 'Complete data isolation with tenant-specific branding and configuration', details: ['Complete data isolation per tenant', 'Path-based and subdomain routing', 'Tenant-specific branding (logo, colors, favicon)', 'Custom currency and localization per tenant', 'Business type configuration', 'Tenant-specific settings and features'] },
  { id: 'business-types', category: 'platform' as Category, title: 'Business Types', icon: Shapes, description: 'Industry-specific configurations for Retail and more', details: ['Retail: Product-focused with inventory management', 'General: Flexible configuration for any business', 'Automatic feature configuration based on type'] },
  { id: 'security', category: 'platform' as Category, title: 'Security & Audit', icon: ShieldCheck, description: 'Enterprise-grade security with complete audit logging', details: ['JWT token-based authentication', 'Secure password hashing (bcrypt)', 'Role-based access control', 'Tenant data isolation', 'Complete audit trail', 'Before/after value tracking', 'IP address and user agent logging'] },
  { id: 'settings', category: 'platform' as Category, title: 'Settings', icon: Settings2, description: 'Comprehensive settings for branding, receipts, taxes, and feature flags', details: ['Company information and branding', 'Currency and localization settings', 'Receipt template customization', 'Tax configuration', 'Feature flags (enable/disable features)', 'Business hours and holidays management', 'Notification templates'] },
  { id: 'offline', category: 'platform' as Category, title: 'Offline Support', icon: WifiOff, description: 'Work offline with automatic sync when connection is restored', details: ['Automatic offline mode detection', 'Local storage for offline transactions', 'Offline product browsing', 'Offline cart management', 'Automatic sync when online', 'Conflict resolution'] },
  { id: 'i18n', category: 'platform' as Category, title: 'Internationalization', icon: Languages, description: 'Multi-language support with localized formatting', details: ['English and Spanish support', 'Extensible for additional languages', 'Localized date/time formatting', 'Localized number formatting', 'Localized currency formatting', 'Timezone support'] },
];

/** Shipped capability cards — keep marketing hero stats in sync with this list. */
export const FEATURE_MODULE_COUNT = features.length;

const TABS: { key: Category; label: string; count: number }[] = [
  { key: 'all', label: 'All', count: features.length },
  { key: 'pos', label: 'Point of Sale', count: features.filter((f) => f.category === 'pos').length },
  { key: 'inventory', label: 'Inventory', count: features.filter((f) => f.category === 'inventory').length },
  { key: 'customers', label: 'Customers & Staff', count: features.filter((f) => f.category === 'customers').length },
  { key: 'analytics', label: 'Analytics', count: features.filter((f) => f.category === 'analytics').length },
  { key: 'platform', label: 'Platform', count: features.filter((f) => f.category === 'platform').length },
];

const CATEGORY_ACCENT: Record<Category, string> = {
  all: '#35979c',
  pos: '#35979c',
  inventory: '#10b981',
  customers: '#8b5cf6',
  analytics: '#f97316',
  platform: '#64748b',
};

export default function FeaturesGrid() {
  const [activeTab, setActiveTab] = useState<Category>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = activeTab === 'all' ? features : features.filter((f) => f.category === activeTab);

  return (
    <div>
      {/* Category selector — segmented keypad */}
      <div className="inline-flex flex-wrap gap-1 p-1 mb-4 rounded-lg bg-gray-100 border border-gray-200" role="tablist" aria-label="Feature categories">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => { setActiveTab(tab.key); setOpenId(null); }}
              className={`${isActive ? 'mk-key' : 'text-gray-600 hover:text-gray-900 hover:bg-white'} inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[13px] font-medium`}
            >
              {tab.label}
              <span className={`font-mono text-[10px] px-1 rounded ${isActive ? 'bg-white/15 text-white' : 'bg-white text-gray-500'}`}>{tab.count}</span>
            </button>
          );
        })}
      </div>

      {/* Dense tile grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2" role="tabpanel">
        {filtered.map((feature, i) => {
          const isOpen = openId === feature.id;
          const accent = CATEGORY_ACCENT[feature.category];
          return (
            <article
              key={feature.id}
              className={`mk-panel mk-reveal rounded-lg relative overflow-hidden ${isOpen ? 'sm:col-span-2 ring-1 ring-brand/40' : ''}`}
              style={{ ['--i' as string]: i % 4 }}
            >
              <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: accent }} aria-hidden="true" />
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpenId(isOpen ? null : feature.id)}
                className="w-full text-left flex items-start gap-2.5 px-3.5 py-3 group"
              >
                <span
                  className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110"
                  style={{ background: `${accent}1a`, color: accent }}
                  aria-hidden="true"
                >
                  <feature.icon className="w-4 h-4" strokeWidth={2.25} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-sm text-gray-900 leading-tight">{feature.title}</h3>
                    <Plus className={`w-3.5 h-3.5 flex-shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-45' : 'group-hover:text-brand'}`} aria-hidden="true" />
                  </span>
                  <span className={`block text-xs text-gray-500 leading-snug mt-1 ${isOpen ? '' : 'line-clamp-2'}`}>{feature.description}</span>
                </span>
              </button>

              {isOpen && (
                <ul className="px-3.5 pb-3.5 pt-0 grid sm:grid-cols-2 gap-x-4 gap-y-1.5" aria-label={`${feature.title} details`}>
                  {feature.details.map((detail) => (
                    <li key={detail} className="flex items-start gap-1.5 text-xs text-gray-600 leading-snug">
                      <span className="flex-shrink-0 mt-[3px] w-3 h-3 rounded-sm text-white flex items-center justify-center" style={{ background: accent }} aria-hidden="true">
                        <Check className="w-2.5 h-2.5" strokeWidth={3.5} />
                      </span>
                      {detail}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
