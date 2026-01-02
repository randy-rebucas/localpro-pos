'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function MarketingPage() {
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const features = [
    {
      id: 'core-pos',
      title: 'Core POS Features',
      icon: '🛒',
      description: 'Complete point of sale interface with shopping cart, payments, and receipts',
      details: [
        'Shopping cart system with real-time calculations',
        'Product search & filtering by name, SKU, or barcode',
        'Real-time stock validation',
        'Multiple payment methods (Cash, Card, Digital Wallet)',
        'Customizable receipt generation (PDF, Print, Email)',
        'Transaction management with full history',
        'Refund processing with stock restoration'
      ]
    },
    {
      id: 'product-management',
      title: 'Product Management',
      icon: '📦',
      description: 'Comprehensive product management with variations, bundles, and barcode support',
      details: [
        'Full CRUD operations for products',
        'Product categories and organization',
        'SKU tracking and management',
        'Product variations (size, color, type)',
        'Product bundles with automatic stock deduction',
        'Barcode & QR code scanning and generation',
        'Product images and descriptions'
      ]
    },
    {
      id: 'inventory',
      title: 'Inventory Management',
      icon: '📊',
      description: 'Real-time inventory tracking with multi-branch support and low stock alerts',
      details: [
        'Real-time stock updates via Server-Sent Events',
        'Complete stock movement history',
        'Multi-branch inventory with transfers',
        'Low stock alerts and notifications',
        'Stock movement types: Sale, Purchase, Adjustment, Return, Damage, Transfer',
        'Automated stock deduction on sales'
      ]
    },
    {
      id: 'multi-tenant',
      title: 'Multi-Tenant Architecture',
      icon: '🏢',
      description: 'Complete data isolation with tenant-specific branding and configuration',
      details: [
        'Complete data isolation per tenant',
        'Path-based and subdomain routing',
        'Tenant-specific branding (logo, colors, favicon)',
        'Custom currency and localization per tenant',
        'Business type configuration',
        'Tenant-specific settings and features'
      ]
    },
    {
      id: 'business-types',
      title: 'Multi-Business Type Support',
      icon: '🎯',
      description: 'Industry-specific configurations for Retail, Restaurant, Laundry, Service, and more',
      details: [
        'Retail: Product-focused with inventory management',
        'Restaurant: Menu items with modifiers and allergens',
        'Laundry: Service-based with weight-based pricing',
        'Service: Time-based services with staff assignment',
        'General: Flexible configuration for any business',
        'Automatic feature configuration based on type'
      ]
    },
    {
      id: 'user-management',
      title: 'User Management & Authentication',
      icon: '👥',
      description: 'Flexible authentication with role-based access control',
      details: [
        'Email/Password authentication',
        'PIN-based login (4-6 digits)',
        'QR code-based login',
        'Role-based access control (Owner, Admin, Manager, Cashier, Viewer)',
        'User profiles with activity tracking',
        'Session management with JWT tokens'
      ]
    },
    {
      id: 'customers',
      title: 'Customer Management',
      icon: '👤',
      description: 'Comprehensive customer profiles with analytics and lifetime value tracking',
      details: [
        'Customer information and contact details',
        'Multiple addresses per customer',
        'Customer tags and categorization',
        'Purchase history and analytics',
        'Customer lifetime value calculation',
        'Customer notes and preferences'
      ]
    },
    {
      id: 'discounts',
      title: 'Discount & Promo System',
      icon: '🎁',
      description: 'Flexible discount codes with usage limits and validity periods',
      details: [
        'Percentage and fixed amount discounts',
        'Product, category, or store-wide discounts',
        'Minimum purchase requirements',
        'Usage limits per code and per customer',
        'Validity periods with start/end dates',
        'Real-time discount validation'
      ]
    },
    {
      id: 'tax',
      title: 'Tax Rules Management',
      icon: '💰',
      description: 'Flexible tax configuration with multiple tax rules support',
      details: [
        'Flat rate and percentage-based taxes',
        'Product, category, and region-specific taxes',
        'Custom tax labels (VAT, GST, Sales Tax)',
        'Multiple tax rules with priority ordering',
        'Automatic tax calculation',
        'Tax reporting and breakdown'
      ]
    },
    {
      id: 'reports',
      title: 'Reports & Analytics',
      icon: '📈',
      description: 'Comprehensive reporting with sales, product, financial, and attendance analytics',
      details: [
        'Sales reports (Daily, Weekly, Monthly, Custom)',
        'Product performance and analytics',
        'Financial reports (Profit & Loss)',
        'VAT/Tax reports',
        'Cash drawer session reports',
        'Bundle performance reports',
        'Attendance reports',
        'Export capabilities (CSV, Excel, PDF)'
      ]
    },
    {
      id: 'attendance',
      title: 'Attendance Management',
      icon: '⏰',
      description: 'Time tracking with clock in/out, breaks, and location tracking',
      details: [
        'Clock in/out functionality',
        'Break tracking (start/end)',
        'Automatic hours calculation',
        'Attendance history and records',
        'GPS location capture (optional)',
        'Auto clock-out for forgotten sessions'
      ]
    },
    {
      id: 'cash-drawer',
      title: 'Cash Drawer Management',
      icon: '💵',
      description: 'Cash drawer sessions with opening/closing amounts and reconciliation',
      details: [
        'Opening cash drawer with starting amount',
        'Closing cash drawer with count',
        'Shortage/overage detection',
        'Cash sales and expenses tracking',
        'Session history and reports',
        'Auto-close at end of day'
      ]
    },
    {
      id: 'expenses',
      title: 'Expense Management',
      icon: '💸',
      description: 'Track expenses with categories, receipts, and integration with P&L reports',
      details: [
        'Expense categories and organization',
        'Receipt attachments',
        'Payment method tracking',
        'Date-based filtering',
        'Integration with profit/loss reports',
        'Category-wise expense breakdown'
      ]
    },
    {
      id: 'booking',
      title: 'Booking & Scheduling',
      icon: '📅',
      description: 'Calendar-based booking system with reminders and status management',
      details: [
        'Calendar views (Month, Week, Day)',
        'Create, edit, cancel, and delete bookings',
        'Customer and service information',
        'Staff assignment',
        'Booking status management',
        'Automated reminders (24h before)',
        'Conflict detection'
      ]
    },
    {
      id: 'currency',
      title: 'Multi-Currency Support',
      icon: '🌍',
      description: 'Support for multiple currencies with automatic exchange rates',
      details: [
        'Base currency per tenant',
        'Display currencies',
        'Automatic exchange rate fetching',
        'Multiple exchange rate providers',
        'Real-time currency conversion',
        'Multi-currency reporting'
      ]
    },
    {
      id: 'branches',
      title: 'Branch Management',
      icon: '🏪',
      description: 'Multi-branch support with branch-specific inventory and reporting',
      details: [
        'Create and manage multiple branches',
        'Branch-specific stock levels',
        'Stock transfers between branches',
        'Branch-specific reports',
        'Cross-branch comparisons',
        'Consolidated reporting'
      ]
    },
    {
      id: 'bundles',
      title: 'Bundles Management',
      icon: '📦',
      description: 'Product bundles with automatic stock management and analytics',
      details: [
        'Create and manage product bundles',
        'Bundle-specific pricing',
        'Automatic stock deduction for all bundle items',
        'Bundle performance tracking',
        'Component product analysis',
        'Bulk bundle operations'
      ]
    },
    {
      id: 'hardware',
      title: 'Hardware Integration',
      icon: '🖨️',
      description: 'Support for barcode scanners, QR code scanners, and receipt printers',
      details: [
        'USB and wireless barcode scanners',
        'Camera-based QR code scanning',
        'ESC/POS compatible receipt printers',
        'Per-tenant hardware configuration',
        'Hardware status monitoring',
        'Connection error handling'
      ]
    },
    {
      id: 'settings',
      title: 'Settings & Configuration',
      icon: '⚙️',
      description: 'Comprehensive settings for branding, receipts, taxes, and feature flags',
      details: [
        'Company information and branding',
        'Currency and localization settings',
        'Receipt template customization',
        'Tax configuration',
        'Feature flags (enable/disable features)',
        'Business hours and holidays management',
        'Notification templates'
      ]
    },
    {
      id: 'security',
      title: 'Security & Audit',
      icon: '🔒',
      description: 'Enterprise-grade security with complete audit logging',
      details: [
        'JWT token-based authentication',
        'Secure password hashing (bcrypt)',
        'Role-based access control',
        'Tenant data isolation',
        'Complete audit trail',
        'Before/after value tracking',
        'IP address and user agent logging'
      ]
    },
    {
      id: 'automations',
      title: 'Automations',
      icon: '🤖',
      description: '30+ automated workflows to reduce manual work',
      details: [
        'Automated booking reminders',
        'Low stock alerts',
        'Transaction receipt auto-email',
        'Scheduled reports',
        'Auto clock-out for attendance',
        'Cash drawer auto-close',
        'Customer welcome emails',
        'And 23+ more automations'
      ]
    },
    {
      id: 'offline',
      title: 'Offline Support',
      icon: '📱',
      description: 'Work offline with automatic sync when connection is restored',
      details: [
        'Automatic offline mode detection',
        'Local storage for offline transactions',
        'Offline product browsing',
        'Offline cart management',
        'Automatic sync when online',
        'Conflict resolution'
      ]
    },
    {
      id: 'i18n',
      title: 'Internationalization',
      icon: '🌐',
      description: 'Multi-language support with localized formatting',
      details: [
        'English and Spanish support',
        'Extensible for additional languages',
        'Localized date/time formatting',
        'Localized number formatting',
        'Localized currency formatting',
        'Timezone support'
      ]
    }
  ];

  const stats = [
    { label: 'Features', value: '100+' },
    { label: 'Automations', value: '30+' },
    { label: 'Business Types', value: '5' },
    { label: 'Languages', value: '2+' }
  ];

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-blue-600 via-indigo-700 to-purple-800 text-white py-24 md:py-32 px-4 overflow-hidden">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div 
            className="absolute top-20 left-10 w-72 h-72 bg-blue-400/20 rounded-full blur-3xl animate-pulse"
            style={{ animationDelay: '0s', animationDuration: '4s' }}
          />
          <div 
            className="absolute bottom-20 right-10 w-96 h-96 bg-purple-400/20 rounded-full blur-3xl animate-pulse"
            style={{ animationDelay: '2s', animationDuration: '5s' }}
          />
          <div 
            className="absolute top-1/2 left-1/2 w-80 h-80 bg-indigo-400/10 rounded-full blur-3xl animate-pulse"
            style={{ animationDelay: '1s', animationDuration: '6s' }}
          />
        </div>

        <div className="relative max-w-7xl mx-auto text-center z-10">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md border border-white/30 px-4 py-2 rounded-full mb-6 animate-fade-in">
            <span className="text-sm font-semibold">✨ Enterprise-Grade POS System</span>
          </div>

          <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold mb-6 animate-fade-in bg-gradient-to-r from-white via-blue-100 to-white bg-clip-text text-transparent">
            LocalPro POS
          </h1>
          <p className="text-2xl md:text-3xl mb-6 text-blue-50 max-w-3xl mx-auto font-light">
            Transform Your Business Operations
          </p>
          <p className="text-lg md:text-xl mb-12 text-blue-100 max-w-2xl mx-auto leading-relaxed">
            The most comprehensive POS solution with <span className="font-bold text-white">100+ features</span>, 
            multi-tenant architecture, real-time inventory, and <span className="font-bold text-white">30+ automated workflows</span>.
          </p>
          
          {/* Enhanced Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 max-w-5xl mx-auto mb-12">
            {stats.map((stat, index) => (
              <div 
                key={index} 
                className="group bg-white/15 backdrop-blur-md border border-white/30 p-6 md:p-8 hover:bg-white/20 transition-all duration-300 hover:scale-105 hover:shadow-2xl"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="text-4xl md:text-5xl font-bold mb-2 bg-gradient-to-br from-white to-blue-200 bg-clip-text text-transparent">
                  {stat.value}
                </div>
                <div className="text-blue-100 text-sm md:text-base font-medium">{stat.label}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              href="/signup"
              className="group relative bg-white text-blue-600 px-10 py-5 font-bold text-lg hover:bg-blue-50 transition-all duration-300 hover:scale-105 hover:shadow-2xl overflow-hidden"
            >
              <span className="relative z-10">Get Started Free</span>
              <div className="absolute inset-0 bg-gradient-to-r from-blue-50 to-indigo-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </Link>
            <a
              href="#features"
              className="group bg-transparent text-white px-10 py-5 font-bold text-lg border-2 border-white/50 hover:border-white hover:bg-white/10 transition-all duration-300 hover:scale-105"
            >
              Explore Features ↓
            </a>
          </div>

          {/* Scroll Indicator */}
          <div className="mt-16 animate-bounce">
            <div className="w-6 h-10 border-2 border-white/50 rounded-full mx-auto flex items-start justify-center p-2">
              <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 px-4 bg-gradient-to-b from-gray-50 to-white relative">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <div className="inline-block bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm font-semibold mb-4">
              POWERFUL FEATURES
            </div>
            <h2 className="text-5xl md:text-6xl font-bold mb-6 text-gray-900">
              Everything You Need
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
              A comprehensive suite of features designed to streamline your business operations
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {features.map((feature, index) => (
              <div
                key={feature.id}
                className="group relative bg-white border-2 border-gray-200 p-6 md:p-8 cursor-pointer transition-all duration-300 hover:border-blue-400 hover:shadow-2xl hover:-translate-y-2 overflow-hidden"
                onClick={() => setActiveSection(activeSection === feature.id ? null : feature.id)}
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                {/* Gradient Overlay on Hover */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-50/0 to-indigo-50/0 group-hover:from-blue-50/50 group-hover:to-indigo-50/50 transition-all duration-300" />
                
                <div className="relative z-10">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="text-5xl transform group-hover:scale-110 transition-transform duration-300">
                      {feature.icon}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold mb-2 text-gray-900 group-hover:text-blue-600 transition-colors">
                        {feature.title}
                      </h3>
                      <p className="text-gray-600 text-sm mb-4 leading-relaxed">
                        {feature.description}
                      </p>
                    </div>
                  </div>

                  {activeSection === feature.id && (
                    <div className="mt-4 pt-4 border-t-2 border-blue-200 animate-fade-in">
                      <ul className="space-y-3">
                        {feature.details.map((detail, idx) => (
                          <li key={idx} className="flex items-start gap-3 text-sm text-gray-700">
                            <span className="flex-shrink-0 w-5 h-5 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold mt-0.5">
                              ✓
                            </span>
                            <span className="leading-relaxed">{detail}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {activeSection !== feature.id && (
                    <div className="flex items-center gap-2 text-blue-600 text-sm font-semibold mt-4 group-hover:gap-3 transition-all">
                      <span>View Details</span>
                      <span className="transform group-hover:translate-x-1 transition-transform">→</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Key Highlights */}
      <section className="py-24 px-4 bg-gradient-to-b from-white via-blue-50/30 to-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <div className="inline-block bg-indigo-100 text-indigo-700 px-4 py-2 rounded-full text-sm font-semibold mb-4">
              WHY CHOOSE US
            </div>
            <h2 className="text-5xl md:text-6xl font-bold mb-6 text-gray-900">
              Built for Modern Businesses
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Enterprise-grade features that scale with your business
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
            <div className="group relative text-center p-10 bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200 hover:border-blue-400 transition-all duration-300 hover:shadow-2xl hover:-translate-y-2">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-200/30 rounded-full blur-2xl -z-10" />
              <div className="text-6xl mb-6 transform group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300">🏢</div>
              <h3 className="text-2xl font-bold mb-4 text-gray-900">Multi-Tenant</h3>
              <p className="text-gray-700 leading-relaxed">
                Complete data isolation with tenant-specific branding, settings, and configurations. 
                Perfect for SaaS deployments and enterprise solutions.
              </p>
            </div>

            <div className="group relative text-center p-10 bg-gradient-to-br from-emerald-50 to-emerald-100 border-2 border-emerald-200 hover:border-emerald-400 transition-all duration-300 hover:shadow-2xl hover:-translate-y-2">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-200/30 rounded-full blur-2xl -z-10" />
              <div className="text-6xl mb-6 transform group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300">⚡</div>
              <h3 className="text-2xl font-bold mb-4 text-gray-900">Real-Time</h3>
              <p className="text-gray-700 leading-relaxed">
                Real-time inventory updates, stock validation, and Server-Sent Events for 
                instant synchronization across all devices and locations.
              </p>
            </div>

            <div className="group relative text-center p-10 bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-200 hover:border-purple-400 transition-all duration-300 hover:shadow-2xl hover:-translate-y-2">
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-200/30 rounded-full blur-2xl -z-10" />
              <div className="text-6xl mb-6 transform group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300">🤖</div>
              <h3 className="text-2xl font-bold mb-4 text-gray-900">Automated</h3>
              <p className="text-gray-700 leading-relaxed">
                30+ automated workflows including booking reminders, low stock alerts, 
                scheduled reports, and intelligent business automation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Business Types */}
      <section className="py-24 px-4 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <div className="inline-block bg-purple-100 text-purple-700 px-4 py-2 rounded-full text-sm font-semibold mb-4">
              VERSATILE SOLUTION
            </div>
            <h2 className="text-5xl md:text-6xl font-bold mb-6 text-gray-900">
              Built for Every Business
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Industry-specific configurations tailored to your business model
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            {[
              { icon: '🏪', name: 'Retail', desc: 'Product-focused with inventory', color: 'from-blue-500 to-blue-600' },
              { icon: '🍕', name: 'Restaurant', desc: 'Menu items with modifiers', color: 'from-orange-500 to-red-500' },
              { icon: '👔', name: 'Laundry', desc: 'Service-based operations', color: 'from-cyan-500 to-blue-500' },
              { icon: '💼', name: 'Service', desc: 'Time-based services', color: 'from-indigo-500 to-purple-500' },
              { icon: '🔧', name: 'General', desc: 'Flexible configuration', color: 'from-gray-500 to-gray-600' }
            ].map((type, index) => (
              <div 
                key={index} 
                className="group relative bg-white border-2 border-gray-200 p-8 text-center transition-all duration-300 hover:border-blue-400 hover:shadow-xl hover:-translate-y-2 overflow-hidden"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${type.color} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />
                <div className="relative z-10">
                  <div className="text-6xl mb-4 transform group-hover:scale-125 group-hover:rotate-12 transition-transform duration-300">
                    {type.icon}
                  </div>
                  <h3 className="text-xl font-bold mb-2 text-gray-900 group-hover:text-blue-600 transition-colors">
                    {type.name}
                  </h3>
                  <p className="text-sm text-gray-600">{type.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-24 px-4 bg-gradient-to-b from-white to-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-block bg-green-100 text-green-700 px-4 py-2 rounded-full text-sm font-semibold mb-4">
                KEY BENEFITS
              </div>
              <h2 className="text-4xl md:text-5xl font-bold mb-6 text-gray-900">
                Streamline Your Operations
              </h2>
              <div className="space-y-6">
                {[
                  { title: 'Save Time', desc: '30+ automations reduce manual work by up to 80%' },
                  { title: 'Increase Revenue', desc: 'Advanced analytics help identify growth opportunities' },
                  { title: 'Reduce Errors', desc: 'Real-time validation prevents costly mistakes' },
                  { title: 'Scale Easily', desc: 'Multi-tenant architecture grows with your business' }
                ].map((benefit, index) => (
                  <div key={index} className="flex gap-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">
                      ✓
                    </div>
                    <div>
                      <h3 className="text-xl font-bold mb-1 text-gray-900">{benefit.title}</h3>
                      <p className="text-gray-600">{benefit.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="bg-gradient-to-br from-blue-500 via-indigo-600 to-purple-700 rounded-2xl p-12 text-white shadow-2xl">
                <div className="space-y-8">
                  <div className="text-center">
                    <div className="text-6xl font-bold mb-2">100+</div>
                    <div className="text-xl opacity-90">Features</div>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="text-center p-4 bg-white/10 rounded-lg backdrop-blur-sm">
                      <div className="text-3xl font-bold mb-1">30+</div>
                      <div className="text-sm opacity-80">Automations</div>
                    </div>
                    <div className="text-center p-4 bg-white/10 rounded-lg backdrop-blur-sm">
                      <div className="text-3xl font-bold mb-1">5</div>
                      <div className="text-sm opacity-80">Business Types</div>
                    </div>
                    <div className="text-center p-4 bg-white/10 rounded-lg backdrop-blur-sm">
                      <div className="text-3xl font-bold mb-1">24/7</div>
                      <div className="text-sm opacity-80">Support</div>
                    </div>
                    <div className="text-center p-4 bg-white/10 rounded-lg backdrop-blur-sm">
                      <div className="text-3xl font-bold mb-1">99.9%</div>
                      <div className="text-sm opacity-80">Uptime</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-24 px-4 bg-gradient-to-br from-blue-600 via-indigo-700 to-purple-800 text-white overflow-hidden">
        {/* Animated Background */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-0 w-96 h-96 bg-blue-400/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-400/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        </div>

        <div className="relative max-w-4xl mx-auto text-center z-10">
          <div className="inline-block bg-white/20 backdrop-blur-md border border-white/30 px-4 py-2 rounded-full text-sm font-semibold mb-6">
            🚀 START YOUR JOURNEY TODAY
          </div>
          <h2 className="text-5xl md:text-6xl font-bold mb-6">
            Ready to Transform Your Business?
          </h2>
          <p className="text-xl md:text-2xl mb-10 text-blue-100 max-w-2xl mx-auto leading-relaxed">
            Join thousands of businesses using LocalPro POS to streamline operations, 
            increase revenue, and scale effortlessly.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              href="/signup"
              className="group relative bg-white text-blue-600 px-10 py-5 font-bold text-lg hover:bg-blue-50 transition-all duration-300 hover:scale-105 hover:shadow-2xl overflow-hidden"
            >
              <span className="relative z-10">Start Free Trial →</span>
              <div className="absolute inset-0 bg-gradient-to-r from-blue-50 to-indigo-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </Link>
            <a
              href="#features"
              className="group bg-transparent text-white px-10 py-5 font-bold text-lg border-2 border-white/50 hover:border-white hover:bg-white/10 transition-all duration-300 hover:scale-105"
            >
              Learn More
            </a>
          </div>
          <p className="mt-8 text-blue-200 text-sm">
            No credit card required • 14-day free trial • Cancel anytime
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-300 py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
            <div>
              <h3 className="text-white font-bold text-xl mb-4">LocalPro POS</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Enterprise-grade Point of Sale System with 100+ features designed for modern businesses.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Integrations</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Documentation</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Support</a></li>
                <li><a href="#" className="hover:text-white transition-colors">API</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center">
            <p className="mb-2 text-gray-400">© 2024 LocalPro POS. All rights reserved.</p>
            <p className="text-sm text-gray-500">
              Enterprise-grade Point of Sale System with 100+ features
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
