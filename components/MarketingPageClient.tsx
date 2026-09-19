'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import {
  Store,
  UtensilsCrossed,
  Shirt,
  Briefcase,
  Wrench,
  Timer,
  TrendingUp,
  ShieldCheck,
  Rocket,
  CreditCard,
  Zap,
  Bell,
  ShoppingCart,
  BarChart3,
  LineChart,
  Building2,
  Bot,
  ShoppingBag,
  ArrowLeftRight,
  Package,
  Receipt,
  Smartphone,
  Camera,
  Image as ImageIcon,
  PlayCircle,
  Menu,
  X,
} from 'lucide-react';
import FeaturesGrid, { FEATURE_MODULE_COUNT } from '@/components/FeaturesGrid';
import { getDictionaryClient } from '@/app/[lang]/dictionaries-client';
import {
  BUSINESS_TYPE_COUNT,
  CORE_AUTOMATION_WORKFLOWS,
  SUPPORTED_UI_LANGUAGES,
  UPTIME_SLA_TARGET_PERCENT,
} from '@/lib/marketing-constants';
import { formatActiveTenants, formatCompletedTransactions } from '@/lib/marketing-format';

/* ── Sub-components (pure JSX — no hooks — server-safe) ──────────── */
function DashboardMockup() {
  const bars = [42, 67, 53, 80, 61, 74, 88, 65, 71, 93, 82, 78];
  const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
  const txns = [
    { id: '#4821', item: 'Chicken Rice Meal', amt: '₱185', status: 'Paid', color: 'text-emerald-400' },
    { id: '#4820', item: 'Coffee + Pastry Set', amt: '₱220', status: 'Paid', color: 'text-emerald-400' },
    { id: '#4819', item: 'Laundry — 5kg', amt: '₱350', status: 'Paid', color: 'text-emerald-400' },
    { id: '#4818', item: 'Haircut Service', amt: '₱250', status: 'Refund', color: 'text-red-400' },
    { id: '#4817', item: 'T-Shirt (M, Blue)', amt: '₱599', status: 'Paid', color: 'text-emerald-400' },
  ];
  const navItems = ['Dashboard', 'Point of Sale', 'Products', 'Customers', 'Inventory', 'Reports', 'Settings'];
  const statCards = [
    { label: "Today's Revenue", val: '₱84,231', change: '+12.4%', up: true },
    { label: 'Transactions', val: '1,248', change: '+8.1%', up: true },
    { label: 'Customers', val: '3,892', change: '+3.7%', up: true },
    { label: 'Low Stock Items', val: '14', change: '−2', up: false },
  ];

  return (
    <div className="bg-gray-950 overflow-hidden text-xs select-none" aria-hidden="true" style={{ minHeight: '420px' }}>
      <div className="flex h-full" style={{ minHeight: '420px' }}>
        {/* Sidebar */}
        <div className="w-40 bg-gray-900 border-r border-gray-800 flex-shrink-0 p-3">
          <div className="flex items-center gap-2 mb-5 px-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- static decorative mockup */}
            <img src="/brand/1pos-logo.png" alt="" className="w-6 h-6 object-contain" width={24} height={24} aria-hidden />
            <span className="text-white font-bold text-sm">1Pos</span>
          </div>
          {navItems.map((item, i) => (
            <div key={item} className={`flex items-center gap-2 px-2 py-2 mb-0.5 ${i === 0 ? 'bg-brand text-white' : 'text-gray-400'}`}>
              <div className={`w-1.5 h-1.5 ${i === 0 ? 'bg-white' : 'bg-gray-600'}`} />
              <span>{item}</span>
            </div>
          ))}
        </div>

        {/* Main */}
        <div className="flex-1 p-4 overflow-hidden bg-gray-950">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-white font-semibold text-sm">Good morning, Admin</div>
              <div className="text-gray-500 text-xs">Today — March 24, 2026</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="bg-brand/20 text-brand-muted px-2 py-1 text-xs font-medium">Premium Plan</div>
              <div className="w-7 h-7 bg-brand flex items-center justify-center text-white text-xs font-bold">A</div>
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            {statCards.map((s) => (
              <div key={s.label} className="bg-gray-900 border border-gray-800 p-3">
                <div className="text-gray-500 text-xs mb-1.5">{s.label}</div>
                <div className="text-white font-bold text-base mb-1">{s.val}</div>
                <div className={`text-xs font-medium ${s.up ? 'text-emerald-400' : 'text-red-400'}`}>{s.change} vs yesterday</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-5 gap-3">
            {/* Bar chart */}
            <div className="col-span-3 bg-gray-900 border border-gray-800 p-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white font-semibold text-xs">Revenue — Last 12 months</span>
                <span className="text-gray-500 text-xs">₱1.2M total</span>
              </div>
              <div className="flex items-end gap-1.5 h-20">
                {bars.map((h, i) => (
                  <div key={i} className="flex-1 flex flex-col justify-end">
                    <div className={`w-full ${i === bars.length - 1 ? 'bg-brand' : 'bg-gray-700'}`} style={{ height: `${h}%` }} />
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-1.5">
                {months.map((m) => (
                  <span key={m} className="text-gray-600" style={{ fontSize: '9px' }}>{m}</span>
                ))}
              </div>
            </div>

            {/* Recent transactions */}
            <div className="col-span-2 bg-gray-900 border border-gray-800 p-3">
              <div className="text-white font-semibold text-xs mb-3">Recent Transactions</div>
              <div className="space-y-2">
                {txns.map((t) => (
                  <div key={t.id} className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="text-gray-300 truncate" style={{ fontSize: '10px', maxWidth: '100px' }}>{t.item}</div>
                      <div className="text-gray-600" style={{ fontSize: '9px' }}>{t.id}</div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-1">
                      <div className="text-white font-medium" style={{ fontSize: '10px' }}>{t.amt}</div>
                      <div className={`${t.color} font-medium`} style={{ fontSize: '9px' }}>{t.status}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main client component ───────────────────────────────────────── */
type PlatformStats = { activeTenants: number; completedTransactions: number };

export default function MarketingPageClient() {
  const [preferredLang, setPreferredLang] = useState<'en' | 'es'>('en');
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [platformStats, setPlatformStats] = useState<PlatformStats | 'loading' | 'failed'>('loading');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('preferred_lang');
    if (stored === 'en' || stored === 'es') setPreferredLang(stored);
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'preferred_lang' && (e.newValue === 'en' || e.newValue === 'es')) setPreferredLang(e.newValue);
    };
    const onCustom = (e: Event) => {
      const lang = (e as CustomEvent<string>).detail;
      if (lang === 'en' || lang === 'es') setPreferredLang(lang);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('preferred_lang_change', onCustom);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('preferred_lang_change', onCustom);
    };
  }, []);

  useEffect(() => {
    getDictionaryClient(preferredLang).then(setDict);
  }, [preferredLang]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/public/platform-stats');
        const json = await res.json();
        if (cancelled || !json?.success || !json?.data) {
          if (!cancelled) setPlatformStats('failed');
          return;
        }
        setPlatformStats({
          activeTenants: Number(json.data.activeTenants) || 0,
          completedTransactions: Number(json.data.completedTransactions) || 0,
        });
      } catch {
        if (!cancelled) setPlatformStats('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const d = dict?.home;

  const navLinks = [
    { href: '#features', label: d?.navFeatures || 'Features', isLink: false },
    { href: '#solutions', label: d?.navSolutions || 'Solutions', isLink: false },
    { href: '#ecommerce', label: d?.navEcommerce || 'Ecommerce', isLink: false },
    { href: '/stores', label: d?.navBrowseStores || 'Browse Stores', isLink: true },
  ];

  const businessTypes = [
    { icon: Store, name: 'Retail', desc: d?.retailDesc || 'Product & inventory focused', overlay: 'bg-brand-navy/80', img: '/images/business/retail.jpg', alt: 'Retail store' },
    { icon: UtensilsCrossed, name: 'Restaurant', desc: d?.restaurantDesc || 'Menu & table management', overlay: 'bg-win8-warning/85', img: '/images/business/restaurant.jpg', alt: 'Restaurant' },
    { icon: Shirt, name: 'Laundry', desc: d?.laundryDesc || 'Weight-based pricing', overlay: 'bg-win8-info/80', img: '/images/business/laundry.jpg', alt: 'Laundry shop' },
    { icon: Briefcase, name: 'Service', desc: d?.serviceDesc || 'Time-based bookings', overlay: 'bg-win8-accent/80', img: '/images/business/service.jpg', alt: 'Service business' },
    { icon: Wrench, name: 'General', desc: d?.generalDesc || 'Fully flexible setup', overlay: 'bg-gray-800/80', img: '/images/business/general.jpg', alt: 'General business' },
  ];


  const benefits = [
    { title: d?.saveTimeTitle || 'Save Time', desc: d?.saveTimeDesc || 'Seven core automations cut repetitive tasks (booking reminders, low stock, receipts, reports, and more)', icon: Timer },
    { title: d?.increaseRevenueTitle || 'Increase Revenue', desc: d?.increaseRevenueDesc || 'Advanced analytics help identify growth opportunities', icon: TrendingUp },
    { title: d?.reduceErrorsTitle || 'Reduce Errors', desc: d?.reduceErrorsDesc || 'Real-time validation prevents costly mistakes', icon: ShieldCheck },
    { title: d?.scaleEasilyTitle || 'Scale Easily', desc: d?.scaleEasilyDesc || 'Multi-tenant architecture grows with your business', icon: Rocket },
  ];

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">

      {/* ── Site Navigation ────────────────────────────────────── */}
      <header>

        {/* ── Sticky nav ─────────────────────────────────────── */}
        <nav
          className="sticky top-0 z-50 bg-white border-b border-gray-300"
          aria-label="Main navigation"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">

            {/* Logo mark — native img avoids next/image SSR/client srcSet hydration mismatches */}
            <Link href="/" className="flex items-center gap-2 group flex-shrink-0">
              <img
                src="/brand/1pos-logo.png"
                alt="1Pos"
                width={40}
                height={40}
                className="h-10 w-10 object-contain"
                decoding="async"
                fetchPriority="high"
              />
            </Link>

            {/* Centre links */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((item) =>
                item.isLink ? (
                  <Link key={item.label} href={item.href} className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-600 hover:text-white hover:bg-brand-navy transition-colors">
                    {item.label}
                  </Link>
                ) : (
                  <a key={item.label} href={item.href} className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-600 hover:text-white hover:bg-brand-navy transition-colors">
                    {item.label}
                  </a>
                )
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                href="/stores"
                className="hidden sm:inline-flex sm:items-center px-3 py-2 text-sm font-medium text-gray-600 hover:text-white hover:bg-brand-navy transition-colors"
              >
                {d?.signIn || 'Sign in'}
              </Link>
              <Link
                href="/signup"
                className="flex items-center gap-1.5 bg-brand text-white px-4 py-2 text-sm font-semibold hover:brightness-110 transition-[filter]"
              >
                {d?.getStartedFree || 'Get Started Free'}
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <button
                type="button"
                onClick={() => setMobileMenuOpen((open) => !open)}
                className="md:hidden inline-flex items-center justify-center w-9 h-9 border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors"
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-nav-panel"
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>

          </div>

          {/* Mobile menu panel */}
          {mobileMenuOpen && (
            <div id="mobile-nav-panel" className="md:hidden border-t border-gray-300 bg-white">
              <div className="px-4 py-2 flex flex-col">
                {navLinks.map((item) =>
                  item.isLink ? (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="px-2 py-3 text-sm font-medium text-gray-700 border-b border-gray-100 last:border-b-0 hover:bg-gray-100 transition-colors"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <a
                      key={item.label}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="px-2 py-3 text-sm font-medium text-gray-700 border-b border-gray-100 last:border-b-0 hover:bg-gray-100 transition-colors"
                    >
                      {item.label}
                    </a>
                  )
                )}
                <Link
                  href="/stores"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-2 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  {d?.signIn || 'Sign in'}
                </Link>
              </div>
            </div>
          )}
        </nav>

        {/* ── Hero ───────────────────────────────────────────── */}
        <div className="relative bg-brand-navy text-white pt-20 md:pt-28 pb-0 px-4 overflow-hidden">

          {/* Background: flat dot grid texture */}
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <div
              className="absolute inset-0 opacity-[0.06]"
              style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '28px 28px' }}
            />
          </div>

          <div className="relative max-w-7xl mx-auto text-center z-10">

            {/* Status badge */}
            <div className="inline-flex items-center gap-2 bg-white/15 border border-white/25 px-4 py-2 mb-8 text-sm font-medium">
              <span className="w-2 h-2 bg-win8-success flex-shrink-0" aria-hidden="true" />
              {d?.heroBadge || 'BIR-Ready Enterprise POS System'}
            </div>

            {/* H1 */}
            <h1 className="text-7xl md:text-8xl lg:text-9xl font-black mb-5 tracking-tight text-white">
              1pos
            </h1>

            {/* Tagline */}
            <p className="text-2xl md:text-3xl font-light text-white/90 mb-5 tracking-wide">
              {d?.heroTagline || 'Transform Your Business Operations'}
            </p>

            {/* Description */}
            <p className="text-base md:text-lg text-white/85 max-w-xl mx-auto leading-relaxed mb-10">
              {d?.heroDesc || (
                <>
                  The complete point of sale system with{' '}
                  <strong className="text-white font-semibold">{FEATURE_MODULE_COUNT} capability modules</strong>,
                  real-time inventory, multi-tenant architecture, and{' '}
                  <strong className="text-white font-semibold">{CORE_AUTOMATION_WORKFLOWS} core automated workflows</strong>{' '}
                  (booking reminders, low stock, receipts, and more).
                </>
              )}
            </p>

            {/* Inline stats — divider-separated */}
            <div className="flex flex-wrap items-center justify-center gap-0 mb-10">
              {[
                { value: String(FEATURE_MODULE_COUNT), label: d?.heroStatFeatures || 'Features' },
                { value: String(CORE_AUTOMATION_WORKFLOWS), label: d?.heroStatAutomations || 'Automations' },
                { value: String(BUSINESS_TYPE_COUNT), label: d?.heroStatBusinessTypes || 'Business Types' },
                { value: String(SUPPORTED_UI_LANGUAGES), label: d?.heroStatLanguages || 'Languages' },
              ].map((s, i) => (
                <div key={s.label} className="flex items-center">
                  <div className="px-6 py-2 text-center">
                    <div className="text-2xl font-extrabold text-white tracking-tight leading-none">{s.value}</div>
                    <div className="text-xs text-white/70 uppercase tracking-widest mt-0.5">{s.label}</div>
                  </div>
                  {i < 3 && <div className="h-8 w-px bg-white/20" aria-hidden="true" />}
                </div>
              ))}
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mb-4">
              <Link
                href="/signup"
                className="group flex items-center gap-2 bg-white text-brand-navy px-8 py-4 font-bold text-base hover:brightness-95 transition-[filter] duration-200"
              >
                {d?.startFreeTrial || 'Start Free Trial'}
                <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <Link
                href="/stores"
                className="flex items-center gap-2 bg-white/10 text-white px-8 py-4 font-semibold text-base border border-white/30 hover:bg-white/20 transition-colors duration-200"
              >
                {d?.browseLiveStores || 'Browse Live Stores'}
              </Link>
            </div>
            <div className="mb-14">
              <p className="text-white/65 text-xs">
                {d?.noCC || 'No credit card required · 14-day free trial · Cancel anytime'}
              </p>
              {platformStats !== 'loading' && platformStats !== 'failed' && platformStats.activeTenants > 0 && (
                <p className="text-white/75 text-xs mt-1">
                  {(d?.heroLiveTrust || 'Live now: {count} active stores running on 1pos').replace(
                    '{count}',
                    formatActiveTenants(platformStats.activeTenants)
                  )}
                </p>
              )}
            </div>

            {/* Dashboard mockup */}
            <div className="relative w-full">
              {/* Browser chrome */}
              <div className="bg-gray-900 px-4 py-3 flex items-center gap-3 border-x border-t border-white/10" aria-hidden="true">
                <div className="flex gap-1.5 flex-shrink-0">
                  <div className="w-3 h-3 bg-red-500/80" />
                  <div className="w-3 h-3 bg-yellow-500/80" />
                  <div className="w-3 h-3 bg-green-500/80" />
                </div>
                <div className="flex-1 bg-gray-800 h-6 flex items-center px-3 gap-2">
                  <svg className="w-3 h-3 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="text-gray-400 text-xs font-mono">1pos.solutions / your-store / en / dashboard</span>
                </div>
              </div>
              <DashboardMockup />
            </div>

          </div>
        </div>
      </header>

      {/* ── Main content ──────────────────────────────────────── */}
      <main id="main-content">

        {/* Social proof strip */}
        <section aria-label="Platform statistics" className="relative bg-white border-y border-gray-300 py-14 px-4 overflow-hidden">
          <div className="relative max-w-7xl mx-auto">
            <p className="text-center text-xs font-bold uppercase tracking-widest text-gray-400 mb-10">
              {d?.trustedBy || 'Trusted by businesses across industries'}
            </p>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-300 border border-gray-300 overflow-hidden">
              {[
                {
                  value:
                    platformStats === 'loading'
                      ? '…'
                      : platformStats === 'failed'
                        ? '—'
                        : formatActiveTenants(platformStats.activeTenants),
                  label: d?.spActiveStores || 'Active stores',
                  icon: Store,
                  desc:
                    platformStats !== 'loading' && platformStats !== 'failed' && platformStats.activeTenants === 0
                      ? d?.spActiveStoresDescZero ||
                        'No tenants in your connected database yet — create one from Sign up to appear here and on Browse Stores.'
                      : d?.spActiveStoresDesc || 'Active stores in your connected database (same rule as Browse Stores)',
                },
                {
                  value:
                    platformStats === 'loading'
                      ? '…'
                      : platformStats === 'failed'
                        ? '—'
                        : formatCompletedTransactions(platformStats.completedTransactions),
                  label: d?.spTransactions || 'Transactions',
                  icon: CreditCard,
                  desc: d?.spTransactionsDesc || 'completed sales recorded in-app (all tenants)',
                },
                {
                  value: UPTIME_SLA_TARGET_PERCENT,
                  label: d?.spUptimeSla || 'Uptime SLA',
                  icon: Zap,
                  desc: d?.spUptimeSlaDesc || 'target monthly availability (managed production)',
                },
                { value: '24/7', label: d?.spSupport || 'Support', icon: Bell, desc: d?.spSupportDesc || 'whenever you need us' },
              ].map((item) => (
                <div key={item.label} className="bg-white px-8 py-8 flex flex-col items-center text-center hover:bg-gray-100 transition-colors duration-200">
                  <item.icon className="w-8 h-8 text-brand mb-3" aria-hidden="true" />
                  <div className="text-4xl font-extrabold text-gray-900 tracking-tight leading-none mb-1">
                    {item.value}
                  </div>
                  <div className="text-sm font-semibold text-gray-700 mb-0.5">{item.label}</div>
                  <div className="text-xs text-gray-400">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" aria-labelledby="features-heading" className="py-24 px-4 bg-gray-50 relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.035] pointer-events-none"
            aria-hidden="true"
            style={{ backgroundImage: 'radial-gradient(circle, #35979c 1px, transparent 1px)', backgroundSize: '24px 24px' }}
          />

          <div className="relative max-w-7xl mx-auto">
            <div className="text-center mb-14">
              <div className="inline-block bg-brand text-white px-4 py-2 text-sm font-semibold mb-4 tracking-wide">
                {d?.featuresBadge || 'POWERFUL FEATURES'}
              </div>
              <h2 id="features-heading" className="text-5xl md:text-6xl font-bold mb-5 text-gray-900 tracking-tight">
                {d?.featuresHeading || 'Everything You Need'}
              </h2>
              <p className="text-lg text-gray-500 max-w-xl mx-auto leading-relaxed">
                {d?.featuresDesc || '23 built-in modules covering every aspect of running a modern business — from the POS counter to the back office.'}
              </p>
            </div>

            {/* Spotlight cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-12">
              {[
                {
                  icon: ShoppingCart,
                  label: d?.posLabel || 'Point of Sale',
                  headline: d?.posHeadline || 'Sell faster, smarter',
                  body: d?.posBody || 'Full POS with cart, barcode scanning, multiple payment methods, and BIR-compliant official receipt printing.',
                  accent: 'bg-brand',
                },
                {
                  icon: BarChart3,
                  label: d?.inventoryLabel || 'Inventory',
                  headline: d?.inventoryHeadline || 'Always in stock, never guessing',
                  body: d?.inventoryBody || 'Real-time stock tracking across branches, automatic deductions on sale, low-stock alerts, and transfer management.',
                  accent: 'bg-win8-success',
                },
                {
                  icon: LineChart,
                  label: d?.reportsLabel || 'Reports & Analytics',
                  headline: d?.reportsHeadline || 'Know your numbers',
                  body: d?.reportsBody || 'Daily, weekly, and monthly sales reports, P&L statements, VAT summaries, and exportable data in CSV, Excel, or PDF.',
                  accent: 'bg-win8-accent',
                },
              ].map((card) => (
                <div key={card.label} className="bg-white p-7 border border-gray-300 hover:bg-gray-50 transition-colors duration-200">
                  <div className={`inline-flex w-11 h-11 ${card.accent} items-center justify-center mb-4`} aria-hidden="true">
                    <card.icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">{card.label}</div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{card.headline}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{card.body}</p>
                </div>
              ))}
            </div>

            {/* Full feature grid with category tabs */}
            <FeaturesGrid />
          </div>
        </section>

        {/* Key highlights */}
        <section aria-labelledby="highlights-heading" className="py-24 px-4 bg-gray-50">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <div className="inline-block bg-brand text-white px-4 py-2 text-sm font-semibold mb-4">
                {d?.highlightsBadge || 'WHY CHOOSE US'}
              </div>
              <h2 id="highlights-heading" className="text-5xl md:text-6xl font-bold mb-5 text-gray-900">
                {d?.highlightsHeading || 'Built for Modern Businesses'}
              </h2>
              <p className="text-xl text-gray-500 max-w-2xl mx-auto">
                {d?.highlightsDesc || 'Enterprise-grade features that scale with your business'}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-gray-300 border border-gray-300">
              {[
                { icon: Building2, title: d?.multiTenantTitle || 'Multi-Tenant', desc: d?.multiTenantDesc || 'Complete data isolation with tenant-specific branding, settings, and configurations. Perfect for SaaS deployments and enterprise solutions.', tile: 'bg-brand' },
                { icon: Zap, title: d?.realTimeSyncTitle || 'Real-Time Sync', desc: d?.realTimeSyncDesc || 'Real-time inventory updates, stock validation, and Server-Sent Events for instant synchronization across all devices and locations.', tile: 'bg-win8-success' },
                { icon: Bot, title: d?.automatedTitle || 'Automated', desc: d?.automatedDesc || 'Seven core workflows today — booking reminders, low stock alerts, receipt email, scheduled reports, auto clock-out, cash drawer close, and customer welcome messages.', tile: 'bg-win8-accent' },
              ].map((item) => (
                <div key={item.title} className={`text-center p-10 ${item.tile} text-white hover:brightness-110 transition-[filter] duration-200`}>
                  <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center bg-white/15" aria-hidden="true">
                    <item.icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold mb-3 text-white">{item.title}</h3>
                  <p className="text-white/85 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Business Types */}
        <section id="solutions" aria-labelledby="solutions-heading" className="py-24 px-4 bg-white">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <div className="inline-block bg-win8-accent text-white px-4 py-2 text-sm font-semibold mb-4">
                {d?.solutionsBadge || 'VERSATILE SOLUTION'}
              </div>
              <h2 id="solutions-heading" className="text-5xl md:text-6xl font-bold mb-5 text-gray-900">
                {d?.solutionsHeading || 'Built for Every Business'}
              </h2>
              <p className="text-xl text-gray-500 max-w-2xl mx-auto">
                {d?.solutionsDesc || 'Industry-specific configurations tailored to your business model'}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
              {businessTypes.map((type) => (
                <div key={type.name} className="group relative overflow-hidden border border-gray-300 hover:brightness-110 transition-[filter] duration-200" style={{ minHeight: '280px' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={type.img} alt={type.alt} className="absolute inset-0 w-full h-full object-cover" />
                  <div className={`absolute inset-0 ${type.overlay}`} aria-hidden="true" />
                  <div className="relative z-10 flex flex-col justify-end h-full p-6" style={{ minHeight: '280px' }}>
                    <type.icon className="w-9 h-9 text-white mb-3" aria-hidden="true" />
                    <h3 className="text-xl font-bold text-white mb-1">{type.name}</h3>
                    <p className="text-white/85 text-sm leading-snug">{type.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Ecommerce integrations — Shopify & WooCommerce */}
        <section
          id="ecommerce"
          aria-labelledby="ecommerce-heading"
          className="py-24 px-4 bg-white relative overflow-hidden"
        >
          <div
            className="absolute inset-0 opacity-[0.04] pointer-events-none"
            aria-hidden="true"
            style={{ backgroundImage: 'radial-gradient(circle, #1e3a4c 1px, transparent 1px)', backgroundSize: '22px 22px' }}
          />
          <div className="relative max-w-7xl mx-auto">
            <div className="text-center mb-14">
              <div className="inline-block bg-brand-navy text-white px-4 py-2 text-sm font-semibold mb-4 tracking-wide">
                {d?.ecommerceBadge || 'OMNI-CHANNEL'}
              </div>
              <h2 id="ecommerce-heading" className="text-5xl md:text-6xl font-bold mb-5 text-gray-900 tracking-tight">
                {d?.ecommerceHeading || 'Connect your online store'}
              </h2>
              <p className="text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
                {d?.ecommerceDesc ||
                  'Bridge your POS with Shopify or WooCommerce: sync catalog and inventory, import paid web orders, and push stock updates — with encrypted credentials and tenant-controlled toggles.'}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
              <div className="border border-gray-300 bg-white p-8 hover:bg-gray-50 transition-colors duration-200">
                <div className="flex items-center gap-3 mb-4">
                  <ShoppingBag className="w-7 h-7 text-gray-900" aria-hidden="true" />
                  <h3 className="text-xl font-bold text-gray-900">{d?.ecommerceShopifyTitle || 'Shopify'}</h3>
                </div>
                <p className="text-gray-600 leading-relaxed text-sm md:text-base">
                  {d?.ecommerceShopifyBody ||
                    'Secure OAuth, expiring offline tokens, catalog sync, inventory levels at your default location, paid order import, and webhooks — so your storefront and counter stay aligned.'}
                </p>
              </div>
              <div className="border border-gray-300 bg-white p-8 hover:bg-gray-50 transition-colors duration-200">
                <div className="flex items-center gap-3 mb-4">
                  <ShoppingCart className="w-7 h-7 text-gray-900" aria-hidden="true" />
                  <h3 className="text-xl font-bold text-gray-900">{d?.ecommerceWooTitle || 'WooCommerce'}</h3>
                </div>
                <p className="text-gray-600 leading-relaxed text-sm md:text-base">
                  {d?.ecommerceWooBody ||
                    'Connect your WordPress store with REST keys: pull products, map SKUs to POS items, push available quantity after sales, and process order webhooks with HMAC verification.'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[
                {
                  icon: ArrowLeftRight,
                  title: d?.ecommerceCard1Title || 'Two-way inventory',
                  body:
                    d?.ecommerceCard1Body ||
                    'When you sell in-store or online, stock updates flow to the other channel so you avoid overselling.',
                },
                {
                  icon: Package,
                  title: d?.ecommerceCard2Title || 'Catalog sync',
                  body:
                    d?.ecommerceCard2Body ||
                    'Link channel variants to POS products by SKU, pull product data, and keep listings aligned with one click.',
                },
                {
                  icon: Receipt,
                  title: d?.ecommerceCard3Title || 'Order import',
                  body:
                    d?.ecommerceCard3Body ||
                    'Paid Shopify orders and qualifying WooCommerce orders can create POS transactions with idempotent handling.',
                },
              ].map((card) => (
                <div
                  key={card.title}
                  className="bg-gray-900 text-white px-6 py-7 border border-gray-800 hover:border-brand transition-colors duration-200"
                >
                  <card.icon className="w-6 h-6 mb-3 text-brand-muted" aria-hidden="true" />
                  <h4 className="text-base font-bold mb-2 text-white">{card.title}</h4>
                  <p className="text-sm text-gray-300 leading-relaxed">{card.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section aria-labelledby="benefits-heading" className="py-24 px-4 bg-gray-50">
          <div className="max-w-7xl mx-auto">
            <div className="grid md:grid-cols-2 gap-16 items-center">
              <div>
                <div className="inline-block bg-win8-success text-white px-4 py-2 text-sm font-semibold mb-4">
                  {d?.benefitsBadge || 'KEY BENEFITS'}
                </div>
                <h2 id="benefits-heading" className="text-4xl md:text-5xl font-bold mb-8 text-gray-900 leading-tight">
                  {d?.benefitsHeading || 'Streamline Your Operations'}
                </h2>
                <ul className="space-y-6" aria-label="Key business benefits">
                  {benefits.map((b) => (
                    <li key={b.title} className="flex gap-4 items-start">
                      <div className="flex-shrink-0 w-12 h-12 bg-brand flex items-center justify-center" aria-hidden="true"><b.icon className="w-6 h-6 text-white" /></div>
                      <div>
                        <h3 className="text-lg font-bold mb-1 text-gray-900">{b.title}</h3>
                        <p className="text-gray-500">{b.desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Receipt mockup */}
              <div className="relative" aria-hidden="true">
                <div className="bg-gray-900 p-6">
                  <div className="bg-white p-5 font-mono text-xs text-gray-700 mb-4">
                    <div className="text-center mb-3">
                      <div className="font-bold text-base text-gray-900">SANTOS RETAIL</div>
                      <div className="text-gray-500">123 Main St, Makati City</div>
                      <div className="text-gray-500">TIN: 123-456-789-000</div>
                      <div className="border-t border-dashed border-gray-300 my-2" />
                      <div className="text-gray-500">OR No: 0000048821</div>
                      <div className="text-gray-500">March 24, 2026 — 2:41 PM</div>
                    </div>
                    <div className="border-t border-dashed border-gray-300 my-2" />
                    {[['T-Shirt (M, Blue)', '₱599.00'], ['Coffee Mug', '₱250.00'], ['Tote Bag', '₱180.00']].map(([item, price]) => (
                      <div key={item} className="flex justify-between mb-1">
                        <span className="text-gray-600">{item}</span><span>{price}</span>
                      </div>
                    ))}
                    <div className="border-t border-dashed border-gray-300 my-2" />
                    <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>₱1,029.00</span></div>
                    <div className="flex justify-between text-gray-500"><span>VAT (12%)</span><span>₱110.04</span></div>
                    <div className="flex justify-between font-bold text-gray-900 text-sm mt-1"><span>TOTAL</span><span>₱1,139.04</span></div>
                    <div className="border-t border-dashed border-gray-300 my-2" />
                    <div className="text-center text-gray-500">Cash: ₱1,200.00 | Change: ₱60.96</div>
                    <div className="text-center mt-2 text-gray-400">Thank you for shopping!</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[{ v: String(FEATURE_MODULE_COUNT), l: 'Modules', c: 'text-brand-muted' }, { v: '~70%', l: 'Less busywork', c: 'text-emerald-400' }, { v: String(CORE_AUTOMATION_WORKFLOWS), l: 'Automations', c: 'text-purple-400' }, { v: UPTIME_SLA_TARGET_PERCENT, l: 'Uptime', c: 'text-yellow-400' }].map((s) => (
                      <div key={s.l} className="bg-gray-700/60 p-4 text-center">
                        <div className={`text-2xl font-bold ${s.c}`}>{s.v}</div>
                        <div className="text-gray-400 text-xs mt-0.5">{s.l}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="absolute -top-4 -right-4 bg-white px-4 py-3 border border-gray-300">
                  <div className="text-xs text-gray-500 mb-0.5">BIR-compliant</div>
                  <div className="text-sm font-bold text-gray-900">Official Receipt ✓</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section aria-labelledby="mobile-app-heading" className="py-24 px-4 bg-gray-900 relative overflow-hidden">
          <div className="relative max-w-5xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-white/10 text-white px-4 py-2 text-sm font-semibold mb-6 tracking-wide">
              <Smartphone className="w-4 h-4" aria-hidden="true" /> {d?.mobileAppBadge || 'COMPANION APP'}
            </div>
            <h2 id="mobile-app-heading" className="text-4xl md:text-5xl font-bold mb-5 text-white tracking-tight">
              {d?.mobileAppHeading || 'Get the 1POS companion app'}
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed mb-8">
              {d?.mobileAppDesc ||
                'Use your phone camera to scan QR codes and barcodes, and snap product photos straight into your catalog — a handy companion to your 1POS terminal.'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-xl mx-auto mb-10 text-left">
              <div className="bg-white/5 border border-white/10 px-5 py-4">
                <Camera className="w-6 h-6 mb-2 text-white" aria-hidden="true" />
                <h3 className="text-white font-semibold text-sm mb-1">{d?.mobileAppScanTitle || 'Scan barcodes & QR codes'}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  {d?.mobileAppScanBody || 'Look up or add products instantly by scanning with your phone camera.'}
                </p>
              </div>
              <div className="bg-white/5 border border-white/10 px-5 py-4">
                <ImageIcon className="w-6 h-6 mb-2 text-white" aria-hidden="true" />
                <h3 className="text-white font-semibold text-sm mb-1">{d?.mobileAppPhotoTitle || 'Add product photos'}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  {d?.mobileAppPhotoBody || 'Snap and upload product images directly from your phone to your catalog.'}
                </p>
              </div>
            </div>
            <a
              href="https://play.google.com/store/apps/details?id=com.app.onepos"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 bg-white text-gray-900 px-8 py-4 font-bold hover:bg-gray-100 transition-colors duration-200"
            >
              <PlayCircle className="w-6 h-6" aria-hidden="true" />
              {d?.mobileAppGetItOn || 'Get it on Google Play'}
            </a>
          </div>
        </section>

        <section aria-labelledby="cta-heading" className="relative py-24 px-4 bg-brand-navy text-white overflow-hidden">
          <div className="relative max-w-7xl mx-auto text-center z-10">
            <div className="inline-flex items-center gap-2 bg-white/20 border border-white/30 px-4 py-2 text-sm font-semibold mb-6">
              <Rocket className="w-4 h-4" aria-hidden="true" /> {d?.ctaBadge || 'START YOUR JOURNEY TODAY'}
            </div>
            <h2 id="cta-heading" className="text-5xl md:text-6xl font-bold mb-6">
              {d?.ctaHeading || 'Ready to Transform Your Business?'}
            </h2>
            <p className="text-xl mb-10 text-white/80 max-w-2xl mx-auto leading-relaxed">
              {d?.ctaDesc || 'Join businesses using 1pos to streamline operations, tighten inventory control, and scale with multi-branch-ready tooling.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link href="/signup" className="bg-white text-brand px-10 py-4 font-bold text-lg hover:brightness-95 transition-[filter] duration-200">
                {d?.ctaStartTrial || 'Start Your Free 14-Day Trial →'}
              </Link>
              <Link href="/stores" className="bg-white/15 text-white px-10 py-4 font-bold text-lg border-2 border-white/50 hover:bg-white/25 transition-colors duration-200">
                {d?.ctaBrowseLiveStores || 'Browse Live Stores'}
              </Link>
            </div>
            <p className="mt-8 text-white/70 text-sm">
              {d?.ctaNoCC || 'No credit card required · 14-day free trial · Cancel anytime'}
            </p>
          </div>
        </section>

      </main>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="bg-gray-950 text-gray-400 py-16 px-4" aria-label="Site footer">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-12">
            <div className="md:col-span-1">
              <Link href="/" className="inline-block mb-3">
                <img
                  src="/brand/1pos-logo.png"
                  alt="1Pos"
                  width={56}
                  height={56}
                  className="h-14 w-14 object-contain"
                  decoding="async"
                />
              </Link>
              <p className="text-gray-500 text-sm leading-relaxed max-w-sm">
                {d?.footerDesc || `BIR-ready enterprise POS with ${FEATURE_MODULE_COUNT} capability modules for modern Philippine businesses.`}
              </p>
            </div>
            <nav aria-label="Product links">
              <h3 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">{d?.footerProduct || 'Product'}</h3>
              <ul className="space-y-2.5 text-sm">
                <li><a href="#features" className="hover:text-white transition-colors">{d?.footerFeatures || 'Features'}</a></li>
                <li><a href="#solutions" className="hover:text-white transition-colors">{d?.footerSolutions || 'Solutions'}</a></li>
                <li><a href="#ecommerce" className="hover:text-white transition-colors">{d?.footerEcommerce || 'Ecommerce integrations'}</a></li>
                <li><Link href="/stores" className="hover:text-white transition-colors">{d?.footerBrowseStores || 'Browse Stores'}</Link></li>
              </ul>
            </nav>
            <nav aria-label="Legal links">
              <h3 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">{d?.footerCompany || 'Legal'}</h3>
              <ul className="space-y-2.5 text-sm">
                <li><Link href="/privacy" className="hover:text-white transition-colors">{d?.footerPrivacy || 'Privacy Policy'}</Link></li>
                <li><Link href="/signup" className="hover:text-white transition-colors">{d?.footerGetStarted || 'Get Started'}</Link></li>
              </ul>
            </nav>
          </div>
          <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row justify-between items-center gap-3">
            <p className="text-gray-500 text-sm">{d?.footerCopyright || '© 2026 1pos. All rights reserved.'}</p>
            <p className="text-gray-600 text-sm">
              {d?.footerTagline || `BIR-ready POS · ${FEATURE_MODULE_COUNT} modules · ${SUPPORTED_UI_LANGUAGES} languages · Built for the Philippines`}
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
}
