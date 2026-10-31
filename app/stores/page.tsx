'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { RotateCw, Search, SearchX, Store, Users, X } from 'lucide-react';
import MarketingShell from '@/components/marketing/MarketingShell';
import StoreTile, { TYPE_ICONS, tenantDisplayName, tenantType, typeLabel, type DirectoryTenant } from '@/components/marketing/StoreTile';
import { ArrowIcon, FKey, SectionHeader } from '@/components/marketing/ui';
import { useDictSection, usePreferredLang } from '@/components/marketing/useMarketing';
import { Button } from '@/components/ui/button';

type LoadState = 'loading' | 'ready' | 'failed';

const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((out, [k, v]) => out.replace(`{${k}}`, String(v)), s);

/** Public store directory: look up a tenant and jump to its sign-in screen. */
export default function StoresPage() {
  const d = useDictSection('stores');
  const lang = usePreferredLang();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);

  const [tenants, setTenants] = useState<DirectoryTenant[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');

  // Deep link: /stores?q=… (used by the homepage's SearchAction structured data)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) setSearch(q);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/tenants');
        const json = await res.json();
        if (cancelled) return;
        if (!json?.success || !Array.isArray(json.data)) throw new Error('bad response');
        const list = (json.data as DirectoryTenant[]).sort((a, b) => tenantDisplayName(a).localeCompare(tenantDisplayName(b)));
        setTenants(list);
        setState('ready');
      } catch {
        if (!cancelled) setState('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // "/" focuses the lookup from anywhere on the page, like a register's search key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const types = useMemo(() => Array.from(new Set(tenants.map(tenantType))).sort(), [tenants]);
  const cityCount = useMemo(
    () => new Set(tenants.map((t) => t.settings?.address?.city?.trim().toLowerCase()).filter(Boolean)).size,
    [tenants]
  );

  const query = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      tenants.filter((t) => {
        if (typeFilter !== 'All' && tenantType(t) !== typeFilter) return false;
        if (!query) return true;
        const handle = query.startsWith('@') ? query.slice(1) : query;
        return (
          tenantDisplayName(t).toLowerCase().includes(query) ||
          t.slug.toLowerCase().includes(handle) ||
          (t.settings?.address?.city || '').toLowerCase().includes(query)
        );
      }),
    [tenants, typeFilter, query]
  );

  const hrefFor = (t: DirectoryTenant) => `/${t.slug}/${lang}`;
  const topMatch = query && filtered.length > 0 ? filtered[0] : null;
  const isFiltered = query !== '' || typeFilter !== 'All';
  const clear = () => {
    setSearch('');
    setTypeFilter('All');
  };

  const readouts = [
    { label: d?.lcdStores || 'Stores', value: state === 'ready' ? tenants.length : state === 'loading' ? '…' : '—' },
    { label: d?.lcdMatch || 'Match', value: state === 'ready' ? filtered.length : state === 'loading' ? '…' : '—' },
    { label: d?.lcdCities || 'Cities', value: state === 'ready' ? cityCount : state === 'loading' ? '…' : '—' },
  ];

  const countLine =
    state !== 'ready'
      ? ''
      : isFiltered
        ? fill(d?.countFiltered || '{filtered} of {total} stores', { filtered: filtered.length, total: tenants.length })
        : fill(tenants.length === 1 ? d?.countOne || '{count} store' : d?.countAll || '{count} stores', { count: tenants.length });

  return (
    <MarketingShell>
      <main id="main-content">
        {/* Hero + lookup console */}
        <section aria-labelledby="stores-heading" className="relative mk-dark text-white overflow-hidden">
          <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/marketing/sari-sari-cebu.webp" alt="" fetchPriority="high" className="mk-parallax-hero opacity-35 saturate-[0.8] absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0a1620] via-[#0a1620]/85 to-[#0a1620]/40" />
          </div>
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0a1620] to-transparent pointer-events-none" aria-hidden="true" />

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-10 md:pt-14 pb-10 md:pb-12 grid lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-5 mk-hero-in">
              <div className="flex items-center gap-2 mb-4">
                <FKey dark>F1</FKey>
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-muted">{d?.eyebrow || 'Store lookup'}</span>
              </div>
              <h1 id="stores-heading" className="text-4xl sm:text-5xl lg:text-[3.25rem] font-black tracking-tight leading-[1.04] mb-4">
                {d?.title || 'Find your store. Sign in at the till.'}
              </h1>
              <p className="text-[15px] text-white/70 leading-relaxed max-w-lg">
                {d?.desc ||
                  'Every active 1pos store is listed here. Pick yours to open its sign-in screen — owners, managers and cashiers all come in through the same door.'}
              </p>
            </div>

            <div className="lg:col-span-7 mk-hero-in [animation-delay:150ms]">
              <div className="mk-glass backdrop-blur-md rounded-xl p-3 sm:p-4">
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <label htmlFor="store-search" className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
                    {d?.searchLabel || 'Look up a store'}
                  </label>
                  <span className="hidden sm:flex items-center gap-1.5 text-[10px] text-white/40 font-mono">
                    <FKey dark>/</FKey> {d?.hintSearch || 'search'}
                    <FKey dark>↵</FKey> {d?.hintOpen || 'open top match'}
                    <FKey dark>ESC</FKey> {d?.hintClear || 'clear'}
                  </span>
                </div>

                <div className="mk-lcd rounded-md flex items-center gap-2 px-3 h-12">
                  <Search className="w-4 h-4 flex-shrink-0 opacity-70" strokeWidth={2.5} aria-hidden="true" />
                  <input
                    id="store-search"
                    ref={searchRef}
                    type="search"
                    autoComplete="off"
                    spellCheck={false}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && topMatch) router.push(hrefFor(topMatch));
                      if (e.key === 'Escape') setSearch('');
                    }}
                    placeholder={d?.searchPlaceholder || 'Store name, @handle or city'}
                    className="flex-1 min-w-0 bg-transparent text-base font-mono text-[#7ef0d6] placeholder:text-[#7ef0d6]/40 outline-none [&::-webkit-search-cancel-button]:hidden"
                  />
                  {search && (
                    <Button type="button" variant="key" size="icon-sm" onClick={() => setSearch('')} aria-label={d?.clearSearch || 'Clear search'}>
                      <X className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden="true" />
                    </Button>
                  )}
                </div>

                <div className="mt-2.5 flex flex-col sm:flex-row sm:items-center gap-2.5">
                  {types.length > 1 && (
                    <div className="flex flex-wrap gap-1.5 flex-1" role="group" aria-label={d?.filterLabel || 'Business type'}>
                      {['All', ...types].map((type) => {
                        const Icon = type === 'All' ? null : TYPE_ICONS[type] ?? Store;
                        const active = typeFilter === type;
                        return (
                          <Button
                            key={type}
                            type="button"
                            variant={active ? 'brand' : 'key'}
                            aria-pressed={active}
                            onClick={() => setTypeFilter(type)}
                            className="h-8 px-3 text-xs"
                          >
                            {Icon && <Icon className="w-3.5 h-3.5" strokeWidth={2.25} aria-hidden="true" />}
                            {type === 'All' ? d?.allTypes || 'All' : typeLabel(type, d)}
                          </Button>
                        );
                      })}
                    </div>
                  )}
                  <dl className="grid grid-cols-3 gap-1.5 sm:ml-auto sm:w-64">
                    {readouts.map((r) => (
                      <div key={r.label} className="mk-lcd rounded-md px-2 py-1.5 text-center flex flex-col-reverse">
                        <dt className="text-[9px] uppercase tracking-wider mt-1 opacity-75 truncate">{r.label}</dt>
                        <dd key={String(r.value)} className="mk-lcd-on text-lg font-bold leading-none tabular-nums">{r.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Directory */}
        <section aria-labelledby="directory-heading" className="bg-[#eef3f5] px-4 sm:px-6 py-12 md:py-16">
          <div className="max-w-7xl mx-auto">
            <SectionHeader
              id="directory-heading"
              fkey="F2"
              eyebrow={d?.directoryEyebrow || 'Directory'}
              title={d?.directoryTitle || 'Active stores, A–Z'}
              desc={d?.directoryDesc || "The @handle is the store's address — it's what you'll see in the link after you sign in."}
              aside={
                countLine && (
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-mono tabular-nums text-gray-500" aria-live="polite">{countLine}</p>
                    {isFiltered && (
                      <Button type="button" variant="light" size="sm" onClick={clear} className="text-xs">
                        <X className="w-3 h-3" strokeWidth={2.5} aria-hidden="true" />
                        {d?.clearFilters || 'Clear'}
                      </Button>
                    )}
                  </div>
                )
              }
            />

            {state === 'loading' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2" aria-busy="true">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="mk-panel rounded-lg p-3.5 h-[164px] motion-safe:animate-pulse">
                    <div className="flex gap-3">
                      <div className="w-11 h-11 rounded-md bg-gray-200" />
                      <div className="flex-1 space-y-2 pt-1">
                        <div className="h-3.5 bg-gray-200 rounded w-3/4" />
                        <div className="h-2.5 bg-gray-100 rounded w-1/3" />
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      <div className="h-2.5 bg-gray-100 rounded w-1/2" />
                      <div className="h-2.5 bg-gray-100 rounded w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : state === 'failed' ? (
              <EmptyPanel
                icon={<RotateCw className="w-5 h-5" strokeWidth={2.25} aria-hidden="true" />}
                title={d?.errorTitle || "Couldn't load the directory"}
                body={d?.errorDesc || "The store list didn't come back. Check your connection and try again."}
              >
                <Button
                  type="button"
                  variant="brand"
                  onClick={() => {
                    setState('loading');
                    setAttempt((n) => n + 1);
                  }}
                  className="h-10 px-5"
                >
                  {d?.retry || 'Try again'}
                </Button>
              </EmptyPanel>
            ) : filtered.length > 0 ? (
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {filtered.map((t, i) => (
                  <li key={t.slug} className="flex [&>a]:flex-1">
                    <StoreTile tenant={t} href={hrefFor(t)} index={i} topMatch={topMatch?.slug === t.slug} d={d} />
                  </li>
                ))}
              </ul>
            ) : tenants.length === 0 ? (
              <EmptyPanel
                icon={<Store className="w-5 h-5" strokeWidth={2.25} aria-hidden="true" />}
                title={d?.noStoresTitle || 'No stores yet'}
                body={d?.noStoresDesc || 'Nobody has opened a store on this platform yet. Yours can be the first.'}
              >
                <Link href="/signup" className="mk-key-brand mk-sheen inline-flex items-center gap-2 h-10 px-5 rounded-md text-sm font-bold">
                  {d?.createStore || 'Create a store'}
                  <ArrowIcon />
                </Link>
              </EmptyPanel>
            ) : (
              <EmptyPanel
                icon={<SearchX className="w-5 h-5" strokeWidth={2.25} aria-hidden="true" />}
                title={d?.noMatchTitle || 'No store matches that'}
                body={d?.noMatchDesc || 'Check the spelling, or try the city or the @handle instead.'}
              >
                <Button type="button" variant="light" onClick={clear} className="h-10 px-5">
                  {d?.clearFilters || 'Clear'}
                </Button>
              </EmptyPanel>
            )}
          </div>
        </section>

        {/* Closing band */}
        <section aria-labelledby="stores-cta-heading" className="relative mk-dark text-white px-4 sm:px-6 py-12 md:py-16 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/marketing/card-reader.webp" alt="" loading="lazy" className="mk-parallax opacity-30 absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0a1620] via-[#0a1620]/85 to-[#0a1620]/55" />
          </div>
          <div className="relative max-w-7xl mx-auto grid lg:grid-cols-5 gap-2">
            <div className="mk-reveal lg:col-span-3 mk-glass backdrop-blur-md rounded-xl p-6 md:p-8">
              <div className="flex items-center gap-2 mb-3">
                <FKey dark>↵ ENTER</FKey>
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-muted">{d?.ctaEyebrow || 'Open a till'}</span>
              </div>
              <h2 id="stores-cta-heading" className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
                {d?.ctaTitle || "Don't see your store?"}
              </h2>
              <p className="text-sm md:text-[15px] text-white/65 leading-relaxed max-w-xl mb-5">
                {d?.ctaDesc || 'Owners can open one in a few minutes: add products, print a test receipt, ring up a real sale. Free for 14 days, no card needed.'}
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Link href="/signup" className="mk-key-brand mk-sheen inline-flex items-center justify-center gap-2 h-11 px-6 rounded-md font-bold text-sm">
                  {d?.createStore || 'Create a store'}
                  <ArrowIcon className="w-4 h-4" />
                </Link>
                <Link href="/" className="mk-key mk-sheen inline-flex items-center justify-center h-11 px-6 rounded-md font-semibold text-sm">
                  {d?.seeHowItWorks || 'See how 1pos works'}
                </Link>
              </div>
            </div>

            <div style={{ ['--i' as string]: 1 }} className="mk-reveal lg:col-span-2 mk-glass backdrop-blur-md rounded-xl p-6 flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <span className="mk-key-brand w-9 h-9 rounded-md flex items-center justify-center">
                  <Users className="w-4 h-4" strokeWidth={2.25} aria-hidden="true" />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-muted">{d?.staffEyebrow || 'Staff'}</span>
              </div>
              <h2 className="text-xl font-bold tracking-tight mb-2">{d?.staffTitle || 'Working the counter already?'}</h2>
              <p className="text-xs text-white/60 leading-relaxed">
                {d?.staffDesc ||
                  "Ask your owner or manager for the store's @handle and look it up above. Cashier and manager logins are added by them from inside the store — you don't sign up here."}
              </p>
            </div>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}

function EmptyPanel({ icon, title, body, children }: { icon: ReactNode; title: string; body: string; children: ReactNode }) {
  return (
    <div className="mk-panel rounded-lg px-6 py-12 flex flex-col items-center text-center">
      <span className="mk-key-light w-11 h-11 rounded-md flex items-center justify-center text-brand mb-3">{icon}</span>
      <h3 className="text-base font-bold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 max-w-sm mb-5">{body}</p>
      {children}
    </div>
  );
}
