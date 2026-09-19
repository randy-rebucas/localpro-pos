'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Store, UtensilsCrossed, Shirt, Briefcase, Wrench, Search, X, MapPin, Coins, ArrowRight } from 'lucide-react';
import { normalizeImageUrl } from '@/lib/image-utils';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { getDictionaryClient } from '@/app/[lang]/dictionaries-client';

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

const BUSINESS_TYPE_META: Record<string, { icon: typeof Store; label: string; tile: string }> = {
  Retail: { icon: Store, label: 'Retail', tile: 'bg-brand' },
  Restaurant: { icon: UtensilsCrossed, label: 'Restaurant', tile: 'bg-win8-warning' },
  Laundry: { icon: Shirt, label: 'Laundry', tile: 'bg-win8-info' },
  Service: { icon: Briefcase, label: 'Service', tile: 'bg-win8-accent' },
  General: { icon: Wrench, label: 'General', tile: 'bg-gray-600' },
};

const DEFAULT_META = { icon: Store, label: 'Store', tile: 'bg-brand' };

function StoreCard({ tenant, preferredLang, dict }: { tenant: Tenant; preferredLang: string; dict: any }) { // eslint-disable-line @typescript-eslint/no-explicit-any
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
      href={`/${tenant.slug}/${preferredLang}`}
      className="group relative flex flex-col bg-white border border-gray-300 overflow-hidden hover:border-brand transition-colors duration-200"
    >
      {/* Top accent bar */}
      <div
        className={`h-1 w-full ${meta.tile}`}
        style={primaryColor ? { background: primaryColor } : {}}
      />

      {/* Card Header */}
      <div
        className={`relative flex items-center justify-between px-5 py-5 ${meta.tile} text-white`}
        style={primaryColor ? { background: primaryColor } : {}}
      >
        <div className="flex items-center gap-3">
          {logo ? (
            <Image
              src={normalizeImageUrl(logo)}
              alt={displayName}
              width={48}
              height={48}
              className="object-contain bg-white/20 p-1"
            />
          ) : (
            <div className="w-12 h-12 bg-white/20 flex items-center justify-center text-lg font-extrabold text-white">
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

        <span className="flex items-center gap-1 bg-black/20 text-white text-xs font-semibold px-2 py-1 border border-white/20 flex-shrink-0">
          <meta.icon className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">{meta.label}</span>
        </span>
      </div>

      {/* Card Body */}
      <div className="flex flex-col flex-1 px-5 py-4 gap-3">
        <div className="space-y-2">
          {location && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin className="w-4 h-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
              <span className="truncate">{location}</span>
            </div>
          )}
          {currency && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Coins className="w-4 h-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
              <span>{currency}</span>
            </div>
          )}
        </div>

        <div className="mt-auto pt-3 border-t border-gray-300">
          <div className="flex items-center justify-between text-sm font-semibold text-brand group-hover:text-brand-hover">
            <span>{dict?.stores?.enterStore || 'Enter Store'}</span>
            <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" aria-hidden="true" />
          </div>
        </div>
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div className="flex flex-col bg-white border border-gray-300 overflow-hidden animate-pulse">
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
  const [preferredLang, setPreferredLang] = useState<'en' | 'es'>('en');
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getDictionaryClient(preferredLang).then(setDict);
  }, [preferredLang]);

  // Read stored language preference so StoreCard links respect it
  useEffect(() => {
    const stored = localStorage.getItem('preferred_lang');
    if (stored === 'en' || stored === 'es') setPreferredLang(stored as 'en' | 'es');
    // Re-sync whenever LanguageSwitcher updates localStorage
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'preferred_lang' && (e.newValue === 'en' || e.newValue === 'es')) {
        setPreferredLang(e.newValue);
      }
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
      <header className="bg-white border-b border-gray-300 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg text-gray-900 hover:opacity-90 transition-opacity">
            <img
              src="/brand/1pos-logo.png"
              alt="1Pos"
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
              decoding="async"
              fetchPriority="high"
            />
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link href="/signup" className="inline-flex items-center bg-brand text-white px-4 py-1.5 text-sm font-semibold hover:bg-brand-hover transition-colors">
              {dict?.stores?.createStore || 'Create Store'}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative bg-brand-navy text-white py-14 px-4 overflow-hidden">
        <div className="relative max-w-7xl mx-auto text-center z-10">
          <div className="inline-flex items-center gap-2 bg-white/20 border border-white/30 px-4 py-1.5 text-sm font-semibold mb-4">
            <Store className="w-4 h-4" aria-hidden="true" /> {dict?.stores?.storeDirectory || 'Store Directory'}
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-3">{dict?.stores?.selectYourStore || 'Select Your Store'}</h1>
          <p className="text-white/80 text-lg max-w-xl mx-auto">
            {dict?.stores?.storeDirectoryDesc || 'Choose from our network of stores to sign in and manage your business'}
          </p>
          <div className="flex justify-center gap-10 mt-8">
            <div className="text-center">
              <div className="text-3xl font-bold tabular-nums">{loading ? '—' : tenants.length}</div>
              <div className="text-white/70 text-sm mt-0.5">{dict?.stores?.activeStores || 'Active Stores'}</div>
            </div>
            <div className="w-px bg-white/20" />
            <div className="text-center">
              <div className="text-3xl font-bold tabular-nums">{availableTypes.length > 1 ? availableTypes.length - 1 : '—'}</div>
              <div className="text-white/70 text-sm mt-0.5">{dict?.stores?.businessTypes || 'Business Types'}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Search + Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-4">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
            <input
              ref={searchRef}
              type="text"
              placeholder={dict?.stores?.searchPlaceholder || 'Search by store name, slug, or city'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:border-brand focus:outline-none transition-colors bg-white"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {availableTypes.length > 2 && (
            <div className="flex gap-1.5 flex-wrap">
              {availableTypes.map((type) => {
                const TypeIcon = type !== 'All' ? BUSINESS_TYPE_META[type]?.icon : null;
                return (
                  <button
                    key={type}
                    onClick={() => setTypeFilter(type)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border transition-colors ${
                      typeFilter === type
                        ? 'bg-brand border-brand text-white'
                        : 'bg-white border-gray-300 text-gray-600 hover:border-brand hover:text-brand'
                    }`}
                  >
                    {TypeIcon && <TypeIcon className="w-3.5 h-3.5" aria-hidden="true" />}
                    {type === 'All' ? (dict?.stores?.allTypes || 'All Types') : type}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Results count */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-3">
        {!loading && (
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
            {filtered.length === tenants.length
              ? (tenants.length !== 1
                  ? (dict?.stores?.storesAvailablePlural || '{count} stores available').replace('{count}', String(tenants.length))
                  : (dict?.stores?.storesAvailable || '{count} store available').replace('{count}', String(tenants.length)))
              : (dict?.stores?.storesFiltered || '{filtered} of {total} stores').replace('{filtered}', String(filtered.length)).replace('{total}', String(tenants.length))}
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
              <StoreCard key={tenant.slug} tenant={tenant} preferredLang={preferredLang} dict={dict} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Search className="w-12 h-12 text-gray-300 mb-4" aria-hidden="true" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">{dict?.stores?.noStoresFound || 'No stores found'}</h3>
            <p className="text-gray-500 text-sm mb-6 max-w-sm">
              {tenants.length === 0
                ? (dict?.stores?.noStoresYet || 'No stores are available yet. Be the first to create one!')
                : (dict?.stores?.tryAdjusting || 'Try adjusting your search or filter.')}
            </p>
            <div className="flex gap-2">
              {(search || typeFilter !== 'All') && (
                <button
                  onClick={() => { setSearch(''); setTypeFilter('All'); }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-semibold hover:border-brand transition-colors"
                >
                  {dict?.stores?.clearFilters || 'Clear filters'}
                </button>
              )}
              <Link href="/signup" className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors">
                {dict?.stores?.createAStore || 'Create a Store'}
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Footer CTA */}
      {!loading && tenants.length > 0 && (
        <div className="border-t border-gray-300 bg-white py-10 px-4">
          <div className="max-w-xl mx-auto text-center">
            <h3 className="text-base font-bold text-gray-900 mb-1">{dict?.stores?.dontSeeYourStore || "Don't see your store?"}</h3>
            <p className="text-gray-500 text-sm mb-5">{dict?.stores?.getStartedDesc || 'Get started and create your own store in minutes.'}</p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 bg-brand text-white px-7 py-2.5 text-sm font-bold hover:bg-brand-hover transition-colors"
            >
              <span>{dict?.stores?.createYourStore || 'Create Your Store'}</span>
              <span>→</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
