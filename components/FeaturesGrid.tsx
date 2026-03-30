'use client';

import { useState } from 'react';

type Category = 'all' | 'pos' | 'inventory' | 'customers' | 'analytics' | 'platform';

const features = [
  // ── Point of Sale ──────────────────────────────────────────────────
  { id: 'core-pos', category: 'pos' as Category, title: 'Core POS', icon: '🛒', description: 'Complete point of sale interface with shopping cart, payments, and receipts', details: ['Shopping cart with real-time calculations', 'Product search & filtering by name, SKU, or barcode', 'Real-time stock validation', 'Multiple payment methods (Cash, Card, Digital Wallet)', 'Customizable receipt generation (PDF, Print, Email)', 'Transaction management with full history', 'Refund processing with stock restoration'] },
  { id: 'discounts', category: 'pos' as Category, title: 'Discounts & Promos', icon: '🎁', description: 'Flexible discount codes with usage limits and validity periods', details: ['Percentage and fixed amount discounts', 'Product, category, or store-wide discounts', 'Minimum purchase requirements', 'Usage limits per code and per customer', 'Validity periods with start/end dates', 'Real-time discount validation'] },
  { id: 'tax', category: 'pos' as Category, title: 'Tax & BIR Compliance', icon: '💰', description: 'BIR-ready tax configuration with VAT computation and official receipt generation', details: ['Flat rate and percentage-based taxes', 'BIR-compliant official receipts (OR)', 'Custom tax labels (VAT, GST, Sales Tax)', 'Multiple tax rules with priority ordering', 'Automatic VAT calculation', 'CAS reporting for BIR audit'] },
  { id: 'cash-drawer', category: 'pos' as Category, title: 'Cash Drawer', icon: '💵', description: 'Cash drawer sessions with opening/closing amounts and reconciliation', details: ['Opening cash drawer with starting amount', 'Closing cash drawer with count', 'Shortage/overage detection', 'Cash sales and expenses tracking', 'Session history and reports', 'Auto-close at end of day'] },
  { id: 'currency', category: 'pos' as Category, title: 'Multi-Currency', icon: '🌍', description: 'Support for multiple currencies with automatic exchange rates', details: ['Base currency per tenant', 'Display currencies', 'Automatic exchange rate fetching', 'Multiple exchange rate providers', 'Real-time currency conversion', 'Multi-currency reporting'] },
  // ── Inventory ──────────────────────────────────────────────────────
  { id: 'product-management', category: 'inventory' as Category, title: 'Product Management', icon: '📦', description: 'Comprehensive product management with variations, bundles, and barcode support', details: ['Full CRUD operations for products', 'Product categories and organization', 'SKU tracking and management', 'Product variations (size, color, type)', 'Product bundles with automatic stock deduction', 'Barcode & QR code scanning and generation', 'Product images and descriptions'] },
  { id: 'inventory', category: 'inventory' as Category, title: 'Inventory Tracking', icon: '📊', description: 'Real-time inventory tracking with multi-branch support and low stock alerts', details: ['Real-time stock updates via Server-Sent Events', 'Complete stock movement history', 'Multi-branch inventory with transfers', 'Low stock alerts and notifications', 'Stock movement types: Sale, Purchase, Adjustment, Return, Damage, Transfer', 'Automated stock deduction on sales'] },
  { id: 'branches', category: 'inventory' as Category, title: 'Branch Management', icon: '🏪', description: 'Multi-branch support with branch-specific inventory and reporting', details: ['Create and manage multiple branches', 'Branch-specific stock levels', 'Stock transfers between branches', 'Branch-specific reports', 'Cross-branch comparisons', 'Consolidated reporting'] },
  { id: 'bundles', category: 'inventory' as Category, title: 'Product Bundles', icon: '🗂️', description: 'Product bundles with automatic stock management and analytics', details: ['Create and manage product bundles', 'Bundle-specific pricing', 'Automatic stock deduction for all bundle items', 'Bundle performance tracking', 'Component product analysis', 'Bulk bundle operations'] },
  { id: 'expenses', category: 'inventory' as Category, title: 'Expense Management', icon: '💸', description: 'Track expenses with categories, receipts, and integration with P&L reports', details: ['Expense categories and organization', 'Receipt attachments', 'Payment method tracking', 'Date-based filtering', 'Integration with profit/loss reports', 'Category-wise expense breakdown'] },
  { id: 'hardware', category: 'inventory' as Category, title: 'Hardware Integration', icon: '🖨️', description: 'Support for barcode scanners, QR code scanners, and receipt printers', details: ['USB and wireless barcode scanners', 'Camera-based QR code scanning', 'ESC/POS compatible receipt printers', 'Per-tenant hardware configuration', 'Hardware status monitoring', 'Connection error handling'] },
  // ── Customers ──────────────────────────────────────────────────────
  { id: 'customers', category: 'customers' as Category, title: 'Customer Management', icon: '👤', description: 'Comprehensive customer profiles with analytics and lifetime value tracking', details: ['Customer information and contact details', 'Multiple addresses per customer', 'Customer tags and categorization', 'Purchase history and analytics', 'Customer lifetime value calculation', 'Customer notes and preferences'] },
  { id: 'booking', category: 'customers' as Category, title: 'Booking & Scheduling', icon: '📅', description: 'Calendar-based booking system with reminders and status management', details: ['Calendar views (Month, Week, Day)', 'Create, edit, cancel, and delete bookings', 'Customer and service information', 'Staff assignment', 'Booking status management', 'Automated reminders (24h before)', 'Conflict detection'] },
  { id: 'user-management', category: 'customers' as Category, title: 'User Management', icon: '👥', description: 'Flexible authentication with role-based access control', details: ['Email/Password authentication', 'PIN-based login (4-6 digits)', 'QR code-based login', 'Role-based access control (Owner, Admin, Manager, Cashier, Viewer)', 'User profiles with activity tracking', 'Session management with JWT tokens'] },
  { id: 'attendance', category: 'customers' as Category, title: 'Attendance', icon: '⏰', description: 'Time tracking with clock in/out, breaks, and location tracking', details: ['Clock in/out functionality', 'Break tracking (start/end)', 'Automatic hours calculation', 'Attendance history and records', 'GPS location capture (optional)', 'Auto clock-out for forgotten sessions'] },
  // ── Analytics ──────────────────────────────────────────────────────
  { id: 'reports', category: 'analytics' as Category, title: 'Reports & Analytics', icon: '📈', description: 'Comprehensive reporting with sales, product, financial, and attendance analytics', details: ['Sales reports (Daily, Weekly, Monthly, Custom)', 'Product performance and analytics', 'Financial reports (Profit & Loss)', 'VAT/Tax reports', 'Cash drawer session reports', 'Bundle performance reports', 'Export capabilities (CSV, Excel, PDF)'] },
  { id: 'automations', category: 'analytics' as Category, title: 'Automations', icon: '🤖', description: '30+ automated workflows to reduce manual work', details: ['Automated booking reminders', 'Low stock alerts', 'Transaction receipt auto-email', 'Scheduled reports', 'Auto clock-out for attendance', 'Cash drawer auto-close', 'Customer welcome emails', 'And 23+ more automations'] },
  // ── Platform ───────────────────────────────────────────────────────
  { id: 'multi-tenant', category: 'platform' as Category, title: 'Multi-Tenant', icon: '🏢', description: 'Complete data isolation with tenant-specific branding and configuration', details: ['Complete data isolation per tenant', 'Path-based and subdomain routing', 'Tenant-specific branding (logo, colors, favicon)', 'Custom currency and localization per tenant', 'Business type configuration', 'Tenant-specific settings and features'] },
  { id: 'business-types', category: 'platform' as Category, title: 'Business Types', icon: '🎯', description: 'Industry-specific configurations for Retail, Restaurant, Laundry, Service, and more', details: ['Retail: Product-focused with inventory management', 'Restaurant: Menu items with modifiers and allergens', 'Laundry: Service-based with weight-based pricing', 'Service: Time-based services with staff assignment', 'General: Flexible configuration for any business', 'Automatic feature configuration based on type'] },
  { id: 'security', category: 'platform' as Category, title: 'Security & Audit', icon: '🔒', description: 'Enterprise-grade security with complete audit logging', details: ['JWT token-based authentication', 'Secure password hashing (bcrypt)', 'Role-based access control', 'Tenant data isolation', 'Complete audit trail', 'Before/after value tracking', 'IP address and user agent logging'] },
  { id: 'settings', category: 'platform' as Category, title: 'Settings', icon: '⚙️', description: 'Comprehensive settings for branding, receipts, taxes, and feature flags', details: ['Company information and branding', 'Currency and localization settings', 'Receipt template customization', 'Tax configuration', 'Feature flags (enable/disable features)', 'Business hours and holidays management', 'Notification templates'] },
  { id: 'offline', category: 'platform' as Category, title: 'Offline Support', icon: '📱', description: 'Work offline with automatic sync when connection is restored', details: ['Automatic offline mode detection', 'Local storage for offline transactions', 'Offline product browsing', 'Offline cart management', 'Automatic sync when online', 'Conflict resolution'] },
  { id: 'i18n', category: 'platform' as Category, title: 'Internationalization', icon: '🌐', description: 'Multi-language support with localized formatting', details: ['English and Spanish support', 'Extensible for additional languages', 'Localized date/time formatting', 'Localized number formatting', 'Localized currency formatting', 'Timezone support'] },
];

const TABS: { key: Category; label: string; count: number }[] = [
  { key: 'all', label: 'All', count: features.length },
  { key: 'pos', label: 'Point of Sale', count: features.filter((f) => f.category === 'pos').length },
  { key: 'inventory', label: 'Inventory', count: features.filter((f) => f.category === 'inventory').length },
  { key: 'customers', label: 'Customers & Staff', count: features.filter((f) => f.category === 'customers').length },
  { key: 'analytics', label: 'Analytics', count: features.filter((f) => f.category === 'analytics').length },
  { key: 'platform', label: 'Platform', count: features.filter((f) => f.category === 'platform').length },
];

const CATEGORY_ACCENT: Record<Category, string> = {
  all: '#3b82f6',
  pos: '#3b82f6',
  inventory: '#10b981',
  customers: '#8b5cf6',
  analytics: '#f97316',
  platform: '#6b7280',
};

export default function FeaturesGrid() {
  const [activeTab, setActiveTab] = useState<Category>('all');
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const filtered = activeTab === 'all' ? features : features.filter((f) => f.category === activeTab);

  return (
    <div>
      {/* Category tabs */}
      <div className="flex flex-wrap gap-2 mb-8" role="tablist" aria-label="Feature categories">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => { setActiveTab(tab.key); setActiveSection(null); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300 hover:text-gray-900'
              }`}
            >
              {tab.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" role="tabpanel">
        {filtered.map((feature) => {
          const isOpen = activeSection === feature.id;
          const accent = CATEGORY_ACCENT[feature.category];
          return (
            <article
              key={feature.id}
              className={`group relative bg-white rounded-2xl border transition-all duration-200 cursor-pointer overflow-hidden ${
                isOpen
                  ? 'border-gray-300 shadow-md'
                  : 'border-gray-200 hover:border-gray-300 hover:shadow-md hover:-translate-y-0.5'
              }`}
              onClick={() => setActiveSection(isOpen ? null : feature.id)}
            >
              {/* Coloured top stripe */}
              <div className={`h-1 w-full ${accent}`} aria-hidden="true" />

              <div className="p-6">
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-3xl flex-shrink-0 mt-0.5 group-hover:scale-110 transition-transform duration-200" role="img" aria-label={feature.title}>
                    {feature.icon}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-bold text-gray-900 mb-1 leading-tight">{feature.title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{feature.description}</p>
                  </div>
                </div>

                {isOpen && (
                  <ul className="mt-4 pt-4 border-t border-gray-100 space-y-2" aria-label={`${feature.title} details`}>
                    {feature.details.map((detail) => (
                      <li key={detail} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className={`flex-shrink-0 w-4 h-4 ${accent} text-white rounded-full flex items-center justify-center text-xs font-bold mt-0.5`} aria-hidden="true">✓</span>
                        {detail}
                      </li>
                    ))}
                  </ul>
                )}

                <div className={`flex items-center gap-1 text-xs font-semibold mt-4 transition-all ${isOpen ? 'text-gray-400' : 'text-blue-600'}`}>
                  {isOpen ? (
                    <><span>Collapse</span><span aria-hidden="true">↑</span></>
                  ) : (
                    <><span>View details</span><span className="group-hover:translate-x-0.5 transition-transform" aria-hidden="true">→</span></>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
