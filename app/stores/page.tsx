'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Coins, MapPin, ScanBarcode, X } from 'lucide-react';
import { Barcode, LineTag, type Translate } from '@/components/marketing/primitives';
import PublicShell from '@/components/marketing/PublicShell';
import { usePublicCopy } from '@/hooks/usePublicCopy';
import { normalizeImageUrl } from '@/lib/image-utils';

interface Tenant {
  slug: string;
  name: string;
  settings?: {
    companyName?: string;
    logo?: string;
    businessType?: string;
    primaryColor?: string;
    currency?: string;
    address?: {
      city?: string;
      country?: string;
    };
  };
}

const ALL_TYPES = 'all';

/** Signup stores lowercase types and older tenants use capitalized ones, so compare one form. */
const typeOf = (tenant: Tenant) => (tenant.settings?.businessType || 'general').toLowerCase();

function typeLabel(type: string, t: Translate) {
  if (type === 'retail') return t('typeRetail', 'Retail');
  if (type === 'general') return t('typeGeneral', 'General');
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/** Shows the store's logo, or its initials when there is none or it fails to load. */
function StoreLogo({ logo, name, color }: { logo?: string; name: string; color?: string }) {
  const [failed, setFailed] = useState(false);

  if (logo && !failed) {
    return <Image src={normalizeImageUrl(logo)} alt="" width={44} height={44} className="h-11 w-11 object-contain" onError={() => setFailed(true)} />;
  }

  const initials = name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <span
      className="flex h-11 w-11 items-center justify-center bg-ink font-receipt text-sm font-semibold text-paper-white"
      style={color ? { backgroundColor: color } : undefined}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

function StoreTag({ tenant, lang, t }: { tenant: Tenant; lang: string; t: Translate }) {
  const displayName = tenant.settings?.companyName || tenant.name;
  const { logo, primaryColor, currency, address } = tenant.settings ?? {};
  const location = [address?.city, address?.country].filter(Boolean).join(', ');

  return (
    <Link href={`/${tenant.slug}/${lang}`} className="group block h-full drop-shadow-[0_10px_12px_rgb(0_0_0/0.3)]">
      <article className="mk-tear-b flex h-full min-h-[17rem] flex-col bg-paper-white px-5 pb-8 pt-5 text-ink transition-colors group-hover:bg-white">
        <div className="flex items-start justify-between gap-3">
          <StoreLogo logo={logo} name={displayName} color={primaryColor} />
          <span className="font-receipt text-[11px] uppercase tracking-[0.12em] text-ink/70">{typeLabel(typeOf(tenant), t)}</span>
        </div>

        <h2 className="mt-4 line-clamp-2 break-words text-3xl">{displayName}</h2>
        <p className="mt-1 truncate font-receipt text-xs text-ink/60">/{tenant.slug}</p>

        {(location || currency) && (
          <div className="mt-3 space-y-1 border-t border-dashed border-ink/40 pt-3 font-receipt text-xs">
            {location && (
              <p className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-brand-hover" strokeWidth={1.75} aria-hidden="true" />
                <span className="truncate">{location}</span>
              </p>
            )}
            {currency && (
              <p className="flex items-center gap-2">
                <Coins className="h-3.5 w-3.5 shrink-0 text-brand-hover" strokeWidth={1.75} aria-hidden="true" />
                {currency}
              </p>
            )}
          </div>
        )}

        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <Barcode className="h-7 w-20 text-ink" />
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            {t('enterStore', 'Enter store')}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </span>
        </div>
      </article>
    </Link>
  );
}

const GRID = 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

export default function StoresPage() {
  const { lang, t, shellT } = usePublicCopy('stores');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState(ALL_TYPES);

  useEffect(() => {
    async function fetchTenants() {
      try {
        const res = await fetch('/api/tenants');
        const data = await res.json();
        if (data.success && data.data) setTenants(data.data);
      } catch {
        // The empty state covers a failed load.
      } finally {
        setLoading(false);
      }
    }
    fetchTenants();
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tenants.filter((tenant) => {
      if (typeFilter !== ALL_TYPES && typeOf(tenant) !== typeFilter) return false;
      if (!query) return true;
      return [tenant.settings?.companyName || tenant.name, tenant.slug, tenant.settings?.address?.city || ''].some((value) =>
        value.toLowerCase().includes(query),
      );
    });
  }, [tenants, search, typeFilter]);

  const types = [...new Set(tenants.map(typeOf))];
  const hasFilters = Boolean(search) || typeFilter !== ALL_TYPES;

  const resultCount =
    filtered.length !== tenants.length
      ? t('storesFiltered', '{filtered} of {total} stores').replace('{filtered}', String(filtered.length)).replace('{total}', String(tenants.length))
      : (tenants.length === 1 ? t('storesAvailable', '{count} store available') : t('storesAvailablePlural', '{count} stores available')).replace(
          '{count}',
          String(tenants.length),
        );

  return (
    <PublicShell t={shellT}>
      <section aria-labelledby="stores-heading" className="bg-brand text-ink">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              <LineTag no="00">{t('storeDirectory', 'Store directory')}</LineTag>
              <h1 id="stores-heading" className="mt-4 text-6xl sm:text-7xl lg:text-8xl">
                {t('selectYourStore', 'Select your store')}
              </h1>
              <p className="mt-4 max-w-lg text-lg leading-relaxed">{t('storeDirectoryDesc', 'Find your store to sign in and get back to the counter.')}</p>
            </div>
            {!loading && tenants.length > 0 && (
              <div className="w-fit border-4 border-[#0b1820] bg-[#04100f] px-4 py-3 text-right lg:col-span-4 lg:justify-self-end">
                <p className="font-receipt text-[11px] text-[#8fe3d0]/80">{t('activeStores', 'Active stores')}</p>
                <p className="mk-led-glow font-led text-5xl leading-tight text-[#7df0d6]">{tenants.length}</p>
              </div>
            )}
          </div>

          <div className="relative mt-8">
            <ScanBarcode className="pointer-events-none absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-brand-hover" strokeWidth={1.75} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder', 'Search by store name, link or city')}
              aria-label={t('searchPlaceholder', 'Search by store name, link or city')}
              className="peer w-full border-2 border-ink bg-paper-white py-4 pl-14 pr-12 font-receipt text-ink placeholder:text-ink/55 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {/* The scanner beam lights up while the search has focus. */}
            <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-[#ff3b2f] opacity-0 shadow-[0_0_12px_2px_rgb(255_59_47/0.6)] transition-opacity peer-focus:opacity-100" aria-hidden="true" />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label={t('clearSearch', 'Clear search')}
                className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center justify-center text-ink/60 hover:text-ink"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>

          {types.length > 1 && (
            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={t('filterLabel', 'Filter by business type')}>
              {[ALL_TYPES, ...types].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTypeFilter(type)}
                  aria-pressed={typeFilter === type}
                  className={`border-2 border-ink px-3 font-receipt text-xs ${typeFilter === type ? 'bg-ink text-paper-white' : 'bg-paper-white text-ink hover:bg-paper'}`}
                >
                  {type === ALL_TYPES ? t('allTypes', 'All types') : typeLabel(type, t)}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section aria-label={t('resultsLabel', 'Stores')} className="min-h-[28rem] bg-brand-navy-deep py-10 text-paper-white lg:py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {loading ? (
            <div className={GRID} aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="h-[17rem] bg-paper-white/10 motion-safe:animate-pulse" />
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <>
              <p className="mb-6 font-receipt text-xs text-paper/70" aria-live="polite">
                {resultCount}
              </p>
              <div className={GRID}>
                {filtered.map((tenant) => (
                  <StoreTag key={tenant.slug} tenant={tenant} lang={lang} t={t} />
                ))}
              </div>
            </>
          ) : (
            <div className="mx-auto max-w-sm drop-shadow-[0_10px_12px_rgb(0_0_0/0.3)]">
              <div className="mk-tear-b relative bg-paper-white px-6 pb-10 pt-8 text-center text-ink" aria-live="polite">
                <span className="mk-stamp inline-block border-[3px] border-stamp px-3 py-0.5 font-display text-3xl font-extrabold uppercase text-stamp">
                  {t('voidStamp', 'Void')}
                </span>
                <h2 className="mt-5 text-4xl">{t('noStoresFound', 'No stores found')}</h2>
                <p className="mt-2 leading-relaxed text-ink/75">
                  {tenants.length === 0 ? t('noStoresYet', 'No stores are available yet. Be the first to open one.') : t('tryAdjusting', 'Try a different search or filter.')}
                </p>
                <div className="mt-6 flex flex-col gap-2">
                  {hasFilters && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch('');
                        setTypeFilter(ALL_TYPES);
                      }}
                      className="border-2 border-ink px-4 text-sm font-semibold hover:bg-ink/5"
                    >
                      {t('clearFilters', 'Clear filters')}
                    </button>
                  )}
                  <Link href="/signup" className="flex items-center justify-center bg-ink px-4 text-sm font-semibold text-paper-white hover:bg-brand-navy">
                    {t('createAStore', 'Create a store')}
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {!loading && tenants.length > 0 && (
        <section aria-labelledby="stores-cta-heading" className="bg-paper py-14">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
            <div>
              <h2 id="stores-cta-heading" className="text-4xl sm:text-5xl">
                {t('dontSeeYourStore', 'Don’t see your store?')}
              </h2>
              <p className="mt-2 text-ink/75">{t('getStartedDesc', 'Open your own in minutes, free for 14 days.')}</p>
            </div>
            <Link href="/signup" className="group flex shrink-0 items-center justify-center gap-2 bg-ink px-7 py-4 font-semibold text-paper-white hover:bg-brand-navy">
              {t('createYourStore', 'Create your store')}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </Link>
          </div>
        </section>
      )}
    </PublicShell>
  );
}
