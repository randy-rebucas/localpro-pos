'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import FeaturesGrid from '@/components/FeaturesGrid';
import { getDictionaryClient } from '@/app/[lang]/dictionaries-client';

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
    <div className="bg-gray-950 rounded-b-2xl overflow-hidden text-xs select-none" aria-hidden="true" style={{ minHeight: '420px' }}>
      <div className="flex h-full" style={{ minHeight: '420px' }}>
        {/* Sidebar */}
        <div className="w-40 bg-gray-900 border-r border-gray-800 flex-shrink-0 p-3">
          <div className="flex items-center gap-2 mb-5 px-1">
            <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center text-white font-bold text-xs">1</div>
            <span className="text-white font-bold text-sm">pos</span>
          </div>
          {navItems.map((item, i) => (
            <div key={item} className={`flex items-center gap-2 px-2 py-2 rounded-md mb-0.5 ${i === 0 ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-white' : 'bg-gray-600'}`} />
              <span>{item}</span>
            </div>
          ))}
        </div>

        {/* Main */}
        <div className="flex-1 p-4 overflow-hidden bg-gray-950">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-white font-semibold text-sm">Good morning, Admin 👋</div>
              <div className="text-gray-500 text-xs">Today — March 24, 2026</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="bg-blue-600/20 text-blue-400 px-2 py-1 rounded text-xs font-medium">Premium Plan</div>
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">A</div>
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            {statCards.map((s) => (
              <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                <div className="text-gray-500 text-xs mb-1.5">{s.label}</div>
                <div className="text-white font-bold text-base mb-1">{s.val}</div>
                <div className={`text-xs font-medium ${s.up ? 'text-emerald-400' : 'text-red-400'}`}>{s.change} vs yesterday</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-5 gap-3">
            {/* Bar chart */}
            <div className="col-span-3 bg-gray-900 border border-gray-800 rounded-xl p-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white font-semibold text-xs">Revenue — Last 12 months</span>
                <span className="text-gray-500 text-xs">₱1.2M total</span>
              </div>
              <div className="flex items-end gap-1.5 h-20">
                {bars.map((h, i) => (
                  <div key={i} className="flex-1 flex flex-col justify-end">
                    <div className={`rounded-sm w-full ${i === bars.length - 1 ? 'bg-blue-500' : 'bg-gray-700'}`} style={{ height: `${h}%` }} />
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
            <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-3">
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

const AVATAR_COLORS = ['from-blue-500 to-indigo-600', 'from-violet-500 to-purple-600', 'from-emerald-500 to-teal-600'];
function InitialAvatar({ name, index }: { name: string; index: number }) {
  const initials = name.split(' ').slice(0, 2).map((w) => w[0]).join('');
  return (
    <div
      className={`w-12 h-12 rounded-full bg-gradient-to-br ${AVATAR_COLORS[index % AVATAR_COLORS.length]} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}

/* ── Main client component ───────────────────────────────────────── */
export default function MarketingPageClient() {
  const [preferredLang, setPreferredLang] = useState<'en' | 'es'>('en');
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

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

  const d = dict?.home;

  const businessTypes = [
    { emoji: '🏪', name: 'Retail', desc: d?.retailDesc || 'Product & inventory focused', gradient: 'from-blue-600/70 to-blue-900/90', img: '/images/business/retail.jpg', alt: 'Retail store' },
    { emoji: '🍕', name: 'Restaurant', desc: d?.restaurantDesc || 'Menu & table management', gradient: 'from-orange-600/70 to-red-800/90', img: '/images/business/restaurant.jpg', alt: 'Restaurant' },
    { emoji: '👔', name: 'Laundry', desc: d?.laundryDesc || 'Weight-based pricing', gradient: 'from-cyan-600/70 to-blue-800/90', img: '/images/business/laundry.jpg', alt: 'Laundry shop' },
    { emoji: '💼', name: 'Service', desc: d?.serviceDesc || 'Time-based bookings', gradient: 'from-indigo-600/70 to-purple-900/90', img: '/images/business/service.jpg', alt: 'Service business' },
    { emoji: '🔧', name: 'General', desc: d?.generalDesc || 'Fully flexible setup', gradient: 'from-slate-600/70 to-slate-900/90', img: '/images/business/general.jpg', alt: 'General business' },
  ];

  const testimonials = [
    { quote: d?.testimonial1Quote || '1pos transformed how we run our retail chain. The real-time inventory and multi-branch reporting paid for itself within the first month.', name: d?.testimonial1Name || 'Maria Santos', role: d?.testimonial1Role || 'Owner, Santos Retail Group' },
    { quote: d?.testimonial2Quote || 'The automated workflows alone save my team 3+ hours every day — reminders, stock alerts, and scheduled reports just run themselves.', name: d?.testimonial2Name || 'James Reyes', role: d?.testimonial2Role || 'Operations Manager, FastBite Restaurants' },
    { quote: d?.testimonial3Quote || 'We replaced three separate tools with 1pos. Bookings, customer CRM, and POS all in one platform is an absolute game changer.', name: d?.testimonial3Name || 'Ana Cruz', role: d?.testimonial3Role || 'Director, Cruz Service Centers' },
  ];

  const benefits = [
    { title: d?.saveTimeTitle || 'Save Time', desc: d?.saveTimeDesc || '30+ automations reduce manual work by up to 80%', icon: '⏱️' },
    { title: d?.increaseRevenueTitle || 'Increase Revenue', desc: d?.increaseRevenueDesc || 'Advanced analytics help identify growth opportunities', icon: '📈' },
    { title: d?.reduceErrorsTitle || 'Reduce Errors', desc: d?.reduceErrorsDesc || 'Real-time validation prevents costly mistakes', icon: '🛡️' },
    { title: d?.scaleEasilyTitle || 'Scale Easily', desc: d?.scaleEasilyDesc || 'Multi-tenant architecture grows with your business', icon: '🚀' },
  ];

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">

      {/* ── Site Navigation ────────────────────────────────────── */}
      <header>

        {/* ── Sticky nav ─────────────────────────────────────── */}
        <nav
          className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100"
          aria-label="Main navigation"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">

            {/* Logo mark */}
            <Link href="/" className="flex items-center gap-2 group flex-shrink-0">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-black text-sm group-hover:bg-blue-700 transition-colors">
                1
              </div>
              <span className="font-bold text-xl text-gray-900">pos</span>
            </Link>

            {/* Centre links */}
            <div className="hidden md:flex items-center gap-1">
              {[
                { href: '#features', label: d?.navFeatures || 'Features', isLink: false },
                { href: '#solutions', label: d?.navSolutions || 'Solutions', isLink: false },
                { href: '#ecommerce', label: d?.navEcommerce || 'Ecommerce', isLink: false },
                { href: '#testimonials', label: d?.navCustomers || 'Customers', isLink: false },
                { href: '/stores', label: d?.navBrowseStores || 'Browse Stores', isLink: true },
              ].map((item) =>
                item.isLink ? (
                  <Link key={item.label} href={item.href} className="inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all">
                    {item.label}
                  </Link>
                ) : (
                  <a key={item.label} href={item.href} className="inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all">
                    {item.label}
                  </a>
                )
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                href="/stores"
                className="hidden sm:inline-flex sm:items-center px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
              >
                {d?.signIn || 'Sign in'}
              </Link>
              <Link
                href="/signup"
                className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 shadow-sm transition-colors"
              >
                {d?.getStartedFree || 'Get Started Free'}
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
            </div>

          </div>
        </nav>

        {/* ── Hero ───────────────────────────────────────────── */}
        <div className="relative bg-gradient-to-br from-blue-600 via-indigo-700 to-purple-800 text-white pt-20 md:pt-28 pb-0 px-4 overflow-hidden">

          {/* Background: dot grid + soft orbs */}
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <div
              className="absolute inset-0 opacity-[0.06]"
              style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '28px 28px' }}
            />
            <div className="absolute -top-16 -left-16 w-96 h-96 bg-blue-400/25 rounded-full blur-3xl" />
            <div className="absolute top-1/3 -right-24 w-80 h-80 bg-purple-400/25 rounded-full blur-3xl" />
          </div>

          <div className="relative max-w-7xl mx-auto text-center z-10">

            {/* Status badge */}
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-md border border-white/25 px-4 py-2 rounded-full mb-8 text-sm font-medium">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" aria-hidden="true" />
              {d?.heroBadge || 'BIR-Ready Enterprise POS System'}
            </div>

            {/* H1 */}
            <h1 className="text-7xl md:text-8xl lg:text-9xl font-black mb-5 tracking-tight bg-gradient-to-b from-white via-blue-50 to-blue-200 bg-clip-text text-transparent">
              1pos
            </h1>

            {/* Tagline */}
            <p className="text-2xl md:text-3xl font-light text-white/90 mb-5 tracking-wide">
              {d?.heroTagline || 'Transform Your Business Operations'}
            </p>

            {/* Description */}
            <p className="text-base md:text-lg text-blue-100/90 max-w-xl mx-auto leading-relaxed mb-10">
              {d?.heroDesc || (
                <>
                  The complete point of sale system with{' '}
                  <strong className="text-white font-semibold">100+ features</strong>,
                  real-time inventory, multi-tenant architecture, and{' '}
                  <strong className="text-white font-semibold">30+ automated workflows</strong>.
                </>
              )}
            </p>

            {/* Inline stats — divider-separated */}
            <div className="flex flex-wrap items-center justify-center gap-0 mb-10">
              {[
                { value: '100+', label: d?.heroStatFeatures || 'Features' },
                { value: '30+', label: d?.heroStatAutomations || 'Automations' },
                { value: '5', label: d?.heroStatBusinessTypes || 'Business Types' },
                { value: '2+', label: d?.heroStatLanguages || 'Languages' },
              ].map((s, i) => (
                <div key={s.label} className="flex items-center">
                  <div className="px-6 py-2 text-center">
                    <div className="text-2xl font-extrabold text-white tracking-tight leading-none">{s.value}</div>
                    <div className="text-xs text-blue-200 uppercase tracking-widest mt-0.5">{s.label}</div>
                  </div>
                  {i < 3 && <div className="h-8 w-px bg-white/20" aria-hidden="true" />}
                </div>
              ))}
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mb-4">
              <Link
                href="/signup"
                className="group flex items-center gap-2 bg-white text-blue-700 px-8 py-4 font-bold text-base rounded-xl shadow-lg hover:bg-blue-50 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
              >
                {d?.startFreeTrial || 'Start Free Trial'}
                <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <Link
                href="/stores"
                className="flex items-center gap-2 bg-white/10 backdrop-blur-sm text-white px-8 py-4 font-semibold text-base rounded-xl border border-white/30 hover:bg-white/20 hover:border-white/50 transition-all duration-200"
              >
                {d?.browseLiveStores || 'Browse Live Stores'}
              </Link>
            </div>
            <p className="text-blue-200/70 text-xs mb-14">
              {d?.noCC || 'No credit card required · 14-day free trial · Cancel anytime'}
            </p>

            {/* Dashboard mockup */}
            <div className="relative w-full">
              {/* Browser chrome */}
              <div className="bg-gray-900/95 rounded-t-2xl px-4 py-3 flex items-center gap-3 border-x border-t border-white/10" aria-hidden="true">
                <div className="flex gap-1.5 flex-shrink-0">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <div className="flex-1 bg-gray-800 rounded-md h-6 flex items-center px-3 gap-2">
                  <svg className="w-3 h-3 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="text-gray-400 text-xs font-mono">1pos.solutions / your-store / en / dashboard</span>
                </div>
              </div>
              <DashboardMockup />
              {/* Fade into next section (white bg) */}
              <div className="absolute bottom-0 left-0 right-0 h-28 bg-gradient-to-t from-white to-transparent pointer-events-none" aria-hidden="true" />
            </div>

          </div>
        </div>
      </header>

      {/* ── Main content ──────────────────────────────────────── */}
      <main id="main-content">

        {/* Social proof strip */}
        <section aria-label="Platform statistics" className="relative bg-white border-y border-gray-100 py-14 px-4 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-50/60 via-white to-indigo-50/60 pointer-events-none" aria-hidden="true" />

          <div className="relative max-w-7xl mx-auto">
            <p className="text-center text-xs font-bold uppercase tracking-widest text-gray-400 mb-10">
              {d?.trustedBy || 'Trusted by businesses across industries'}
            </p>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-100 rounded-2xl overflow-hidden shadow-sm">
              {[
                { value: '500+', label: d?.spActiveStores || 'Active stores', icon: '🏪', desc: d?.spActiveStoresDesc || 'and growing every day' },
                { value: '2M+', label: d?.spTransactions || 'Transactions', icon: '💳', desc: d?.spTransactionsDesc || 'processed without downtime' },
                { value: '99.9%', label: d?.spUptimeSla || 'Uptime SLA', icon: '⚡', desc: d?.spUptimeSlaDesc || 'guaranteed reliability' },
                { value: '24/7', label: d?.spSupport || 'Support', icon: '🛎️', desc: d?.spSupportDesc || 'whenever you need us' },
              ].map((item) => (
                <div key={item.label} className="bg-white px-8 py-8 flex flex-col items-center text-center group hover:bg-blue-50/50 transition-colors duration-200">
                  <span className="text-3xl mb-3 group-hover:scale-110 transition-transform duration-200 block" aria-hidden="true">
                    {item.icon}
                  </span>
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
            style={{ backgroundImage: 'radial-gradient(circle, #6366f1 1px, transparent 1px)', backgroundSize: '24px 24px' }}
          />

          <div className="relative max-w-7xl mx-auto">
            <div className="text-center mb-14">
              <div className="inline-block bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm font-semibold mb-4 tracking-wide">
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
                  icon: '🛒',
                  label: d?.posLabel || 'Point of Sale',
                  headline: d?.posHeadline || 'Sell faster, smarter',
                  body: d?.posBody || 'Full POS with cart, barcode scanning, multiple payment methods, and BIR-compliant official receipt printing.',
                  accent: 'bg-blue-600',
                  ring: 'ring-blue-100',
                },
                {
                  icon: '📊',
                  label: d?.inventoryLabel || 'Inventory',
                  headline: d?.inventoryHeadline || 'Always in stock, never guessing',
                  body: d?.inventoryBody || 'Real-time stock tracking across branches, automatic deductions on sale, low-stock alerts, and transfer management.',
                  accent: 'bg-emerald-600',
                  ring: 'ring-emerald-100',
                },
                {
                  icon: '📈',
                  label: d?.reportsLabel || 'Reports & Analytics',
                  headline: d?.reportsHeadline || 'Know your numbers',
                  body: d?.reportsBody || 'Daily, weekly, and monthly sales reports, P&L statements, VAT summaries, and exportable data in CSV, Excel, or PDF.',
                  accent: 'bg-violet-600',
                  ring: 'ring-violet-100',
                },
              ].map((card) => (
                <div key={card.label} className={`bg-white rounded-2xl p-7 shadow-sm ring-1 ${card.ring} hover:shadow-md transition-shadow duration-200`}>
                  <div className={`inline-flex w-11 h-11 rounded-xl ${card.accent} items-center justify-center text-2xl mb-4`} aria-hidden="true">
                    {card.icon}
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
        <section aria-labelledby="highlights-heading" className="py-24 px-4 bg-gradient-to-b from-gray-50 to-white">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <div className="inline-block bg-indigo-100 text-indigo-700 px-4 py-2 rounded-full text-sm font-semibold mb-4">
                {d?.highlightsBadge || 'WHY CHOOSE US'}
              </div>
              <h2 id="highlights-heading" className="text-5xl md:text-6xl font-bold mb-5 text-gray-900">
                {d?.highlightsHeading || 'Built for Modern Businesses'}
              </h2>
              <p className="text-xl text-gray-500 max-w-2xl mx-auto">
                {d?.highlightsDesc || 'Enterprise-grade features that scale with your business'}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { emoji: '🏢', title: d?.multiTenantTitle || 'Multi-Tenant', desc: d?.multiTenantDesc || 'Complete data isolation with tenant-specific branding, settings, and configurations. Perfect for SaaS deployments and enterprise solutions.', bg: 'from-blue-50 to-blue-100', border: 'border-blue-200 hover:border-blue-400' },
                { emoji: '⚡', title: d?.realTimeSyncTitle || 'Real-Time Sync', desc: d?.realTimeSyncDesc || 'Real-time inventory updates, stock validation, and Server-Sent Events for instant synchronization across all devices and locations.', bg: 'from-emerald-50 to-emerald-100', border: 'border-emerald-200 hover:border-emerald-400' },
                { emoji: '🤖', title: d?.automatedTitle || 'Automated', desc: d?.automatedDesc || '30+ automated workflows including booking reminders, low stock alerts, scheduled reports, and intelligent business automation.', bg: 'from-purple-50 to-purple-100', border: 'border-purple-200 hover:border-purple-400' },
              ].map((item) => (
                <div key={item.title} className={`group relative text-center p-10 bg-gradient-to-br ${item.bg} border-2 ${item.border} rounded-2xl transition-all duration-300 hover:shadow-2xl hover:-translate-y-2`}>
                  <div className="text-6xl mb-6 transform group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300" aria-hidden="true">{item.emoji}</div>
                  <h3 className="text-2xl font-bold mb-3 text-gray-900">{item.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Business Types */}
        <section id="solutions" aria-labelledby="solutions-heading" className="py-24 px-4 bg-white">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <div className="inline-block bg-purple-100 text-purple-700 px-4 py-2 rounded-full text-sm font-semibold mb-4">
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
                <div key={type.name} className="group relative rounded-2xl overflow-hidden shadow-md hover:shadow-2xl transition-all duration-300 hover:-translate-y-2" style={{ minHeight: '280px' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={type.img} alt={type.alt} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                  <div className={`absolute inset-0 bg-gradient-to-t ${type.gradient}`} aria-hidden="true" />
                  <div className="relative z-10 flex flex-col justify-end h-full p-6" style={{ minHeight: '280px' }}>
                    <span className="text-4xl mb-3 transform group-hover:scale-110 transition-transform duration-300 block" aria-hidden="true">{type.emoji}</span>
                    <h3 className="text-xl font-bold text-white mb-1">{type.name}</h3>
                    <p className="text-white/75 text-sm leading-snug">{type.desc}</p>
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
          className="py-24 px-4 bg-gradient-to-b from-indigo-50/90 via-white to-slate-50 relative overflow-hidden"
        >
          <div
            className="absolute inset-0 opacity-[0.04] pointer-events-none"
            aria-hidden="true"
            style={{ backgroundImage: 'radial-gradient(circle, #4338ca 1px, transparent 1px)', backgroundSize: '22px 22px' }}
          />
          <div className="relative max-w-7xl mx-auto">
            <div className="text-center mb-14">
              <div className="inline-block bg-indigo-100 text-indigo-800 px-4 py-2 rounded-full text-sm font-semibold mb-4 tracking-wide">
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
              <div className="rounded-2xl border-2 border-emerald-200/80 bg-white p-8 shadow-sm ring-1 ring-emerald-100/80 hover:shadow-md transition-shadow duration-200">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-3xl" aria-hidden="true">
                    🛍️
                  </span>
                  <h3 className="text-xl font-bold text-gray-900">{d?.ecommerceShopifyTitle || 'Shopify'}</h3>
                </div>
                <p className="text-gray-600 leading-relaxed text-sm md:text-base">
                  {d?.ecommerceShopifyBody ||
                    'Secure OAuth, expiring offline tokens, catalog sync, inventory levels at your default location, paid order import, and webhooks — so your storefront and counter stay aligned.'}
                </p>
              </div>
              <div className="rounded-2xl border-2 border-violet-200/80 bg-white p-8 shadow-sm ring-1 ring-violet-100/80 hover:shadow-md transition-shadow duration-200">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-3xl" aria-hidden="true">
                    🛒
                  </span>
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
                  icon: '↔️',
                  title: d?.ecommerceCard1Title || 'Two-way inventory',
                  body:
                    d?.ecommerceCard1Body ||
                    'When you sell in-store or online, stock updates flow to the other channel so you avoid overselling.',
                },
                {
                  icon: '📦',
                  title: d?.ecommerceCard2Title || 'Catalog sync',
                  body:
                    d?.ecommerceCard2Body ||
                    'Link channel variants to POS products by SKU, pull product data, and keep listings aligned with one click.',
                },
                {
                  icon: '🧾',
                  title: d?.ecommerceCard3Title || 'Order import',
                  body:
                    d?.ecommerceCard3Body ||
                    'Paid Shopify orders and qualifying WooCommerce orders can create POS transactions with idempotent handling.',
                },
              ].map((card) => (
                <div
                  key={card.title}
                  className="rounded-xl bg-gray-900 text-white px-6 py-7 border border-gray-800 shadow-lg hover:border-indigo-500/40 transition-colors duration-200"
                >
                  <div className="text-2xl mb-3" aria-hidden="true">
                    {card.icon}
                  </div>
                  <h4 className="text-base font-bold mb-2 text-white">{card.title}</h4>
                  <p className="text-sm text-gray-300 leading-relaxed">{card.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section aria-labelledby="benefits-heading" className="py-24 px-4 bg-gradient-to-b from-gray-50 to-white">
          <div className="max-w-7xl mx-auto">
            <div className="grid md:grid-cols-2 gap-16 items-center">
              <div>
                <div className="inline-block bg-green-100 text-green-700 px-4 py-2 rounded-full text-sm font-semibold mb-4">
                  {d?.benefitsBadge || 'KEY BENEFITS'}
                </div>
                <h2 id="benefits-heading" className="text-4xl md:text-5xl font-bold mb-8 text-gray-900 leading-tight">
                  {d?.benefitsHeading || 'Streamline Your Operations'}
                </h2>
                <ul className="space-y-6" aria-label="Key business benefits">
                  {benefits.map((b) => (
                    <li key={b.title} className="flex gap-4 items-start">
                      <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-xl shadow-md" aria-hidden="true">{b.icon}</div>
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
                <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 shadow-2xl">
                  <div className="bg-white rounded-xl p-5 font-mono text-xs text-gray-700 shadow-lg mb-4">
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
                    {[{ v: '100+', l: 'Features', c: 'text-blue-400' }, { v: '80%', l: 'Less manual work', c: 'text-emerald-400' }, { v: '30+', l: 'Automations', c: 'text-purple-400' }, { v: '99.9%', l: 'Uptime', c: 'text-yellow-400' }].map((s) => (
                      <div key={s.l} className="bg-gray-700/60 rounded-xl p-4 text-center">
                        <div className={`text-2xl font-bold ${s.c}`}>{s.v}</div>
                        <div className="text-gray-400 text-xs mt-0.5">{s.l}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="absolute -top-4 -right-4 bg-white rounded-2xl shadow-xl px-4 py-3 border border-gray-100">
                  <div className="text-xs text-gray-500 mb-0.5">BIR-compliant</div>
                  <div className="text-sm font-bold text-gray-900">Official Receipt ✓</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section id="testimonials" aria-labelledby="testimonials-heading" className="py-24 px-4 bg-white">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <div className="inline-block bg-yellow-100 text-yellow-700 px-4 py-2 rounded-full text-sm font-semibold mb-4">
                {d?.testimonialsBadge || 'CUSTOMER STORIES'}
              </div>
              <h2 id="testimonials-heading" className="text-5xl font-bold mb-5 text-gray-900">
                {d?.testimonialsHeading || 'Loved by Business Owners'}
              </h2>
              <p className="text-xl text-gray-500 max-w-xl mx-auto">
                {d?.testimonialsDesc || 'See what our customers say about running their business with 1pos'}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {testimonials.map((t, i) => (
                <figure key={i} className="bg-gray-50 rounded-2xl p-8 border border-gray-100 hover:shadow-xl transition-shadow duration-300 flex flex-col">
                  <div className="flex gap-1 mb-5" aria-label="5 out of 5 stars">
                    {[...Array(5)].map((_, s) => (
                      <svg key={s} className="w-5 h-5 text-yellow-400 fill-current" viewBox="0 0 20 20" aria-hidden="true">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <blockquote className="text-gray-700 leading-relaxed flex-1 mb-6 text-[15px]">
                    <p>&ldquo;{t.quote}&rdquo;</p>
                  </blockquote>
                  <figcaption className="flex items-center gap-3">
                    <InitialAvatar name={t.name} index={i} />
                    <div>
                      <cite className="not-italic font-semibold text-gray-900 text-sm block">{t.name}</cite>
                      <span className="text-xs text-gray-500">{t.role}</span>
                    </div>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section aria-labelledby="cta-heading" className="relative py-24 px-4 bg-gradient-to-br from-blue-600 via-indigo-700 to-purple-800 text-white overflow-hidden">
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <div className="absolute top-0 left-0 w-96 h-96 bg-blue-400/20 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-400/20 rounded-full blur-3xl animate-pulse" />
          </div>
          <div className="relative max-w-7xl mx-auto text-center z-10">
            <div className="inline-block bg-white/20 backdrop-blur-md border border-white/30 px-4 py-2 rounded-full text-sm font-semibold mb-6">
              🚀 {d?.ctaBadge || 'START YOUR JOURNEY TODAY'}
            </div>
            <h2 id="cta-heading" className="text-5xl md:text-6xl font-bold mb-6">
              {d?.ctaHeading || 'Ready to Transform Your Business?'}
            </h2>
            <p className="text-xl mb-10 text-blue-100 max-w-2xl mx-auto leading-relaxed">
              {d?.ctaDesc || 'Join thousands of businesses using 1pos to streamline operations, increase revenue, and scale effortlessly.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link href="/signup" className="bg-white text-blue-600 px-10 py-4 font-bold text-lg hover:bg-blue-50 transition-all duration-300 hover:scale-105 hover:shadow-2xl rounded-xl">
                {d?.ctaStartTrial || 'Start Your Free 14-Day Trial →'}
              </Link>
              <Link href="/stores" className="bg-white/15 backdrop-blur-md text-white px-10 py-4 font-bold text-lg border-2 border-white/50 hover:border-white hover:bg-white/25 transition-all duration-300 hover:scale-105 rounded-xl">
                {d?.ctaBrowseLiveStores || 'Browse Live Stores'}
              </Link>
            </div>
            <p className="mt-8 text-blue-200 text-sm">
              {d?.ctaNoCC || 'No credit card required · 14-day free trial · Cancel anytime'}
            </p>
          </div>
        </section>

      </main>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="bg-gray-950 text-gray-400 py-16 px-4" aria-label="Site footer">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
            <div>
              <Link href="/" className="text-white font-bold text-2xl mb-3 block hover:text-blue-400 transition-colors">1pos</Link>
              <p className="text-gray-500 text-sm leading-relaxed">
                {d?.footerDesc || 'BIR-ready enterprise POS system with 100+ features for modern Philippine businesses.'}
              </p>
            </div>
            <nav aria-label="Product links">
              <h3 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">{d?.footerProduct || 'Product'}</h3>
              <ul className="space-y-2.5 text-sm">
                <li><a href="#features" className="hover:text-white transition-colors">{d?.footerFeatures || 'Features'}</a></li>
                <li><a href="#solutions" className="hover:text-white transition-colors">{d?.footerSolutions || 'Solutions'}</a></li>
                <li><a href="#ecommerce" className="hover:text-white transition-colors">{d?.footerEcommerce || 'Ecommerce integrations'}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">{d?.footerPricing || 'Pricing'}</a></li>
                <li><Link href="/stores" className="hover:text-white transition-colors">{d?.footerBrowseStores || 'Browse Stores'}</Link></li>
              </ul>
            </nav>
            <nav aria-label="Company links">
              <h3 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">{d?.footerCompany || 'Company'}</h3>
              <ul className="space-y-2.5 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">{d?.footerAbout || 'About'}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">{d?.footerBlog || 'Blog'}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">{d?.footerContact || 'Contact'}</a></li>
              </ul>
            </nav>
            <nav aria-label="Resources links">
              <h3 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">{d?.footerResources || 'Resources'}</h3>
              <ul className="space-y-2.5 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">{d?.footerDocumentation || 'Documentation'}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">{d?.footerSupport || 'Support'}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">{d?.footerApiReference || 'API Reference'}</a></li>
              </ul>
            </nav>
          </div>
          <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row justify-between items-center gap-3">
            <p className="text-gray-500 text-sm">{d?.footerCopyright || '© 2026 1pos. All rights reserved.'}</p>
            <p className="text-gray-600 text-sm">{d?.footerTagline || 'BIR-ready POS · 100+ features · Built for the Philippines'}</p>
          </div>
        </div>
      </footer>

    </div>
  );
}
