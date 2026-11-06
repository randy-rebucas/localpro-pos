'use client';

import { useState } from 'react';
import {
  BadgePercent,
  Banknote,
  Boxes,
  Building2,
  CalendarClock,
  ChartColumn,
  Clock,
  Coins,
  Languages,
  Package,
  PackagePlus,
  ReceiptText,
  ScanBarcode,
  Settings,
  Shapes,
  ShieldCheck,
  ShoppingCart,
  Store,
  UserRound,
  UsersRound,
  Wallet,
  WifiOff,
  Workflow,
  Minus,
  Plus,
} from 'lucide-react';

type Category = 'all' | 'pos' | 'inventory' | 'customers' | 'analytics' | 'platform';

const features = [
  // ── Point of Sale ──────────────────────────────────────────────────
  { id: 'core-pos', category: 'pos' as Category, title: 'Core POS', icon: ShoppingCart, description: 'Complete point of sale interface with shopping cart, payments, and receipts', details: ['Shopping cart with real-time calculations', 'Product search & filtering by name, SKU, or barcode', 'Real-time stock validation', 'Multiple payment methods (Cash, Card, Digital Wallet)', 'Customizable receipt generation (PDF, Print, Email)', 'Transaction management with full history', 'Refund processing with stock restoration'] },
  { id: 'discounts', category: 'pos' as Category, title: 'Discounts & Promos', icon: BadgePercent, description: 'Flexible discount codes with usage limits and validity periods', details: ['Percentage and fixed amount discounts', 'Product, category, or store-wide discounts', 'Minimum purchase requirements', 'Usage limits per code and per customer', 'Validity periods with start/end dates', 'Real-time discount validation'] },
  { id: 'tax', category: 'pos' as Category, title: 'Tax & BIR Compliance', icon: ReceiptText, description: 'BIR-ready tax configuration with VAT computation and official receipt generation', details: ['Flat rate and percentage-based taxes', 'BIR-compliant official receipts (OR)', 'Custom tax labels (VAT, GST, Sales Tax)', 'Multiple tax rules with priority ordering', 'Automatic VAT calculation', 'CAS reporting for BIR audit'] },
  { id: 'cash-drawer', category: 'pos' as Category, title: 'Cash Drawer', icon: Banknote, description: 'Cash drawer sessions with opening/closing amounts and reconciliation', details: ['Opening cash drawer with starting amount', 'Closing cash drawer with count', 'Shortage/overage detection', 'Cash sales and expenses tracking', 'Session history and reports', 'Auto-close at end of day'] },
  { id: 'currency', category: 'pos' as Category, title: 'Multi-Currency', icon: Coins, description: 'Support for multiple currencies with automatic exchange rates', details: ['Base currency per tenant', 'Display currencies', 'Automatic exchange rate fetching', 'Multiple exchange rate providers', 'Real-time currency conversion', 'Multi-currency reporting'] },
  // ── Inventory ──────────────────────────────────────────────────────
  { id: 'product-management', category: 'inventory' as Category, title: 'Product Management', icon: Package, description: 'Comprehensive product management with variations, bundles, and barcode support', details: ['Full CRUD operations for products', 'Product categories and organization', 'SKU tracking and management', 'Product variations (size, color, type)', 'Product bundles with automatic stock deduction', 'Barcode & QR code scanning and generation', 'Product images and descriptions'] },
  { id: 'inventory', category: 'inventory' as Category, title: 'Inventory Tracking', icon: Boxes, description: 'Real-time inventory tracking with multi-branch support and low stock alerts', details: ['Real-time stock updates via Server-Sent Events', 'Complete stock movement history', 'Multi-branch inventory with transfers', 'Low stock alerts and notifications', 'Stock movement types: Sale, Purchase, Adjustment, Return, Damage, Transfer', 'Automated stock deduction on sales'] },
  { id: 'branches', category: 'inventory' as Category, title: 'Branch Management', icon: Store, description: 'Multi-branch support with branch-specific inventory and reporting', details: ['Create and manage multiple branches', 'Branch-specific stock levels', 'Stock transfers between branches', 'Branch-specific reports', 'Cross-branch comparisons', 'Consolidated reporting'] },
  { id: 'bundles', category: 'inventory' as Category, title: 'Product Bundles', icon: PackagePlus, description: 'Product bundles with automatic stock management and analytics', details: ['Create and manage product bundles', 'Bundle-specific pricing', 'Automatic stock deduction for all bundle items', 'Bundle performance tracking', 'Component product analysis', 'Bulk bundle operations'] },
  { id: 'expenses', category: 'inventory' as Category, title: 'Expense Management', icon: Wallet, description: 'Track expenses with categories, receipts, and integration with P&L reports', details: ['Expense categories and organization', 'Receipt attachments', 'Payment method tracking', 'Date-based filtering', 'Integration with profit/loss reports', 'Category-wise expense breakdown'] },
  { id: 'hardware', category: 'inventory' as Category, title: 'Hardware Integration', icon: ScanBarcode, description: 'Support for barcode scanners, QR code scanners, and receipt printers', details: ['USB and wireless barcode scanners', 'Camera-based QR code scanning', 'ESC/POS compatible receipt printers', 'Per-tenant hardware configuration', 'Hardware status monitoring', 'Connection error handling'] },
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
  { id: 'business-types', category: 'platform' as Category, title: 'Business Types', icon: Shapes, description: 'Industry-specific configurations for Retail and General businesses', details: ['Retail: Product-focused with inventory management', 'General: Flexible configuration for any business', 'Automatic feature configuration based on type'] },
  { id: 'security', category: 'platform' as Category, title: 'Security & Audit', icon: ShieldCheck, description: 'Enterprise-grade security with complete audit logging', details: ['JWT token-based authentication', 'Secure password hashing (bcrypt)', 'Role-based access control', 'Tenant data isolation', 'Complete audit trail', 'Before/after value tracking', 'IP address and user agent logging'] },
  { id: 'settings', category: 'platform' as Category, title: 'Settings', icon: Settings, description: 'Comprehensive settings for branding, receipts, taxes, and feature flags', details: ['Company information and branding', 'Currency and localization settings', 'Receipt template customization', 'Tax configuration', 'Feature flags (enable/disable features)', 'Business hours and holidays management', 'Notification templates'] },
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

export default function FeaturesGrid() {
  const [activeTab, setActiveTab] = useState<Category>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = activeTab === 'all' ? features : features.filter((f) => f.category === activeTab);

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Module categories">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              id={`modules-tab-${tab.key}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls="modules-panel"
              onClick={() => {
                setActiveTab(tab.key);
                setOpenId(null);
              }}
              className={`border-2 px-3 py-1.5 font-receipt text-xs ${
                isActive ? 'border-ink bg-ink text-paper-white' : 'border-ink/25 text-ink hover:border-ink'
              }`}
            >
              {tab.label} <span className="opacity-60">{tab.count}</span>
            </button>
          );
        })}
      </div>

      <div
        id="modules-panel"
        role="tabpanel"
        aria-labelledby={`modules-tab-${activeTab}`}
        className="mt-8 grid items-start gap-x-12 border-t-2 border-ink md:grid-cols-2"
      >
        {filtered.map((feature, i) => {
          const isOpen = openId === feature.id;
          const Icon = feature.icon;
          return (
            <div key={feature.id} className="border-b border-ink/20">
              <h3>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`module-${feature.id}`}
                  onClick={() => setOpenId(isOpen ? null : feature.id)}
                  className="group flex w-full items-center gap-3 py-4 text-left"
                >
                  <span className="w-6 shrink-0 font-receipt text-xs text-ink/50">{String(i + 1).padStart(2, '0')}</span>
                  <Icon className="h-5 w-5 shrink-0 text-brand-hover" strokeWidth={1.75} aria-hidden="true" />
                  <span className="font-semibold">{feature.title}</span>
                  <span className="mk-leader" aria-hidden="true" />
                  {isOpen ? (
                    <Minus className="h-4 w-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <Plus className="h-4 w-4 shrink-0 transition-transform group-hover:rotate-90" aria-hidden="true" />
                  )}
                </button>
              </h3>
              {isOpen && (
                <div id={`module-${feature.id}`} className="pb-5 pl-9">
                  <p className="leading-relaxed text-ink/75">{feature.description}</p>
                  <ul className="mt-3 space-y-1 font-receipt text-[13px]">
                    {feature.details.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
