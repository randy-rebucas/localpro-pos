'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';

interface Tenant {
  slug: string;
  name: string;
  settings?: {
    companyName?: string;
    logo?: string;
    businessType?: string;
    primaryColor?: string;
    secondaryColor?: string;
    currency?: string;
    language?: string;
    address?: {
      city?: string;
      state?: string;
      country?: string;
    };
  };
}

const BUSINESS_TYPE_META: Record<string, { icon: string; label: string; gradient: string }> = {
  Retail:     { icon: '🏪',     label: 'Retail',      gradient: 'from-blue-500 to-indigo-600' },
  Restaurant: { icon: '🍕', label: 'Restaurant',  gradient: 'from-orange-500 to-red-500' },
  Laundry:    { icon: '👔',    label: 'Laundry',     gradient: 'from-cyan-500 to-blue-500' },
  Service:    { icon: '💼',    label: 'Service',     gradient: 'from-purple-500 to-violet-600' },
  General:    { icon: '🔧',    label: 'General',     gradient: 'from-gray-500 to-slate-600' },
};

const DEFAULT_META = { icon: '🏬', label: 'Store', gradient: 'from-blue-500 to-indigo-600' };

function StoreCard({ tenant }: { tenant: Tenant }) {
  const displayName = tenant.settings?.companyName || tenant.name;
  const businessType = tenant.settings?.businessType || 'General';
  const meta = BUSINESS_TYPE_META[businessType] ?? DEFAULT_META;
  const city = tenant.settings?.address?.city;
  const country = tenant.settings?.address?.country;
  const location = [city, country].filter(Boolean).join(', ');
  const currency = tenant.settings?.currency;
  const primaryColor = tenant.settings?.primaryColor;
  const logo = tenant.settings?.logo;

  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <Link
      href={`/${tenant.slug}/en`}
      className="group relative flex flex-col bg-white border border-gray-200 overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 hover:border-blue-500"
    >
      {/* Top accent bar */}
      <div
        className={`h-1 w-full bg-gradient-to-r ${meta.gradient}`}
        style={primaryColor ? { background: primaryColor } : {}}
      />

      {/* Card Header */}
      <div
        className={`relative flex items-center justify-between px-5 py-5 bg-gradient-to-br ${meta.gradient} text-white overflow-hidden`}
        style={primaryColor ? { background: `linear-gradient(135deg, ${primaryColor}ee, ${primaryColor}99)` } : {}}
      >
        <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/10" style={{ transform: 'rotate(15deg)' }} />
        <div className="absolute -bottom-4 -left-4 w-16 h-16 bg-black/10" style={{ transform: 'rotate(15deg)' }} />

        <div className="flex items-center gap-3 relative z-10">
          {logo ? (
            <img
              src={logo}
              alt={displayName}
              className="w-12 h-12 object-contain bg-white/20 backdrop-blur-sm p-1 shadow"
            />
          ) : (
            <div className="w-12 h-12 bg-white/25 backdrop-blur-sm flex items-center justify-center text-lg font-extrabold text-white shadow">
              {initials}
            </div>
          )}
          <div>
            <h3 className="font-bold text-white text-base leading-tight line-clamp-2">
              {displayName}
            </h3>
            <p className="text-white/70 text-xs mt-0.5">@{tenant.slug}</p>
          </div>
        </div>

        <span className="relative z-10 flex items-center gap-1 bg-black/20 text-white text-xs font-semibold px-2 py-1 border border-white/20 flex-shrink-0">
          <span>{meta.icon}</span>
          <span className="hidden sm:inline">{meta.label}</span>
        </span>
      </div>

      {/* Card Body */}
      <div className="flex flex-col flex-1 px-5 py-4 gap-3">
        <div className="space-y-2">
          {location && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <svg className="w-4 h-4 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="truncate">{location}</span>
            </div>
          )}
          {currency && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <svg className="w-4 h-4 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{currency}</span>
            </div>
          )}
        </div>

        <div className="mt-auto pt-3 border-t border-gray-100">
          <div className="flex items-center justify-between text-sm font-semibold text-blue-600 group-hover:text-blue-700">
            <span>Enter Store</span>
            <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div className="flex flex-col bg-white border border-gray-200 overflow-hidden animate-pulse">
      <div className="h-1 bg-gray-200" />
      <div className="h-24 bg-gray-200" />
      <div className="p-5 space-y-3">
        <div className="h-4 bg-gray-200 w-3/4" />
        <div className="h-3 bg-gray-100 w-1/2" />
        <div className="h-3 bg-gray-100 w-1/3 mt-4" />
      </div>
    </div>
  );
}

export default function StoresPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [filtered, setFiltered] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function fetchTenants() {
      try {
        const res = await fetch('/api/tenants');
        const data = await res.json();
        if (data.success && data.data) {
          setTenants(data.data);
          setFiltered(data.data);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    fetchTenants();
  }, []);

  useEffect(() => {
    let result = tenants;
    if (typeFilter !== 'All') {
      result = result.filter((t) => (t.settings?.businessType || 'General') === typeFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          (t.settings?.companyName || t.name).toLowerCase().includes(q) ||
          t.slug.toLowerCase().includes(q) ||
          (t.settings?.address?.city || '').toLowerCase().includes(q)
      );
    }
    setFiltered(result);
  }, [search, typeFilter, tenants]);

  const availableTypes = [
    'All',
    ...Array.from(new Set(tenants.map((t) => t.settings?.businessType || 'General'))),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg text-gray-900 hover:text-blue-600 transition-colors">
            <span className="text-xl">🏬</span>
            <span>1pos</span>
          </Link>
          <Link href="/signup" className="inline-flex items-center bg-blue-600 text-white px-4 py-1.5 text-sm font-semibold hover:bg-blue-700 transition-colors">
            Create Store
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative bg-gradient-to-br from-blue-600 via-indigo-700 to-purple-800 text-white py-14 px-4 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-10 left-10 w-64 h-64 bg-blue-400/20 blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
          <div className="absolute bottom-0 right-0 w-80 h-80 bg-purple-400/20 blur-3xl animate-pulse" style={{ animationDelay: '2s', animationDuration: '5s' }} />
        </div>
        <div className="relative max-w-3xl mx-auto text-center z-10">
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md border border-white/30 px-4 py-1.5 text-sm font-semibold mb-4">
            🏪 Store Directory
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-3">Select Your Store</h1>
          <p className="text-blue-100 text-lg max-w-xl mx-auto">
            Choose from our network of stores to sign in and manage your business
          </p>
          <div className="flex justify-center gap-10 mt-8">
            <div className="text-center">
              <div className="text-3xl font-bold tabular-nums">{loading ? '—' : tenants.length}</div>
              <div className="text-blue-200 text-sm mt-0.5">Active Stores</div>
            </div>
            <div className="w-px bg-white/20" />
            <div className="text-center">
              <div className="text-3xl font-bold tabular-nums">{availableTypes.length > 1 ? availableTypes.length - 1 : '—'}</div>
              <div className="text-blue-200 text-sm mt-0.5">Business Types</div>
            </div>
          </div>
        </div>
      </section>

      {/* Search + Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-4">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              placeholder="Search by store name, slug, or city"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none transition-colors bg-white"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
          {availableTypes.length > 2 && (
            <div className="flex gap-1.5 flex-wrap">
              {availableTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => setTypeFilter(type)}
                  className={`px-3 py-2 text-xs font-semibold border transition-all ${
                    typeFilter === type
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600'
                  }`}
                >
                  {type === 'All' ? 'All Types' : `${BUSINESS_TYPE_META[type]?.icon ?? ''} ${type}`}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Results count */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-3">
        {!loading && (
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
            {filtered.length === tenants.length
              ? `${tenants.length} store${tenants.length !== 1 ? 's' : ''} available`
              : `${filtered.length} of ${tenants.length} stores`}
          </p>
        )}
      </div>

      {/* Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((tenant) => (
              <StoreCard key={tenant.slug} tenant={tenant} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-5xl mb-4">🔍</div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">No stores found</h3>
            <p className="text-gray-500 text-sm mb-6 max-w-sm">
              {tenants.length === 0
                ? 'No stores are available yet. Be the first to create one!'
                : 'Try adjusting your search or filter.'}
            </p>
            <div className="flex gap-2">
              {(search || typeFilter !== 'All') && (
                <button
                  onClick={() => { setSearch(''); setTypeFilter('All'); }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-semibold hover:border-blue-400 transition-colors"
                >
                  Clear filters
                </button>
              )}
              <Link href="/signup" className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors">
                Create a Store
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Footer CTA */}
      {!loading && tenants.length > 0 && (
        <div className="border-t border-gray-200 bg-white py-10 px-4">
          <div className="max-w-xl mx-auto text-center">
            <h3 className="text-base font-bold text-gray-900 mb-1">Don&apos;t see your store?</h3>
            <p className="text-gray-500 text-sm mb-5">Get started and create your own store in minutes.</p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-7 py-2.5 text-sm font-bold hover:bg-blue-700 transition-colors"
            >
              <span>Create Your Store</span>
              <span>→</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
