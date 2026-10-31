'use client';

import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';
import { BadgeCheck, Check, Minus, RotateCw } from 'lucide-react';
import MarketingShell from './MarketingShell';
import { ArrowIcon, FKey, SectionHeader } from './ui';
import { useDictSection, type HomeDict } from './useMarketing';
import { Button } from '@/components/ui/button';

/** Public fields of a SubscriptionPlan as returned by `GET /api/subscription-plans`. */
interface Plan {
  _id: string;
  name: string;
  tier: string;
  description?: string;
  price: { monthly: number; setupFee: number; currency: string };
  features: Record<string, number | boolean>;
  birCompliance: Record<string, boolean>;
  isCustom?: boolean;
  availableToNewTenants?: boolean;
  yearlyDiscount?: number;
}

type LoadState = 'loading' | 'ready' | 'failed';

const LIMIT_ROWS: [key: string, label: string][] = [
  ['maxUsers', 'Staff logins'],
  ['maxBranches', 'Branches'],
  ['maxProducts', 'Products'],
  ['maxTransactions', 'Sales per month'],
];

const FEATURE_ROWS: [key: string, label: string][] = [
  ['enableInventory', 'Inventory & stock movements'],
  ['enableCategories', 'Product categories'],
  ['enableReports', 'Sales reports'],
  ['enableDiscounts', 'Discounts & promos'],
  ['enableCustomerManagement', 'Customer records'],
  ['enableLoyaltyProgram', 'Loyalty points'],
  ['enableMultiBranch', 'Multi-branch'],
  ['enableHardwareIntegration', 'Printers, scanners & cash drawer'],
  ['enableBookingScheduling', 'Bookings & scheduling'],
  ['prioritySupport', 'Priority support'],
  ['customIntegrations', 'Custom integrations'],
  ['dedicatedAccountManager', 'Dedicated account manager'],
];

const BIR_ROWS: [key: string, label: string][] = [
  ['receiptFormatting', 'BIR-format receipts'],
  ['auditTrailSystem', 'Full audit trail'],
  ['ptuAssistance', 'Permit to Use (PTU) assistance'],
  ['birDocumentation', 'BIR documentation package'],
  ['casReporting', 'CAS reporting'],
  ['monthlySupport', 'Monthly compliance support'],
];

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: currency || 'PHP', maximumFractionDigits: 0 }).format(amount);

function limitText(value: number | boolean | undefined, d: HomeDict) {
  if (typeof value !== 'number') return '—';
  return value === -1 ? d?.unlimited || 'Unlimited' : value.toLocaleString('en-PH');
}

/** /pricing — plan cards and a comparison table, straight from the live plan list. */
export default function PricingPage() {
  const d = useDictSection('pricing');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/subscription-plans');
        const json = await res.json();
        if (cancelled) return;
        if (!json?.success || !Array.isArray(json.data)) throw new Error('bad response');
        const list = (json.data as Plan[])
          .filter((p) => p.availableToNewTenants !== false && !p.isCustom)
          .sort((a, b) => a.price.monthly - b.price.monthly);
        setPlans(list);
        setState('ready');
      } catch {
        if (!cancelled) setState('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // First (cheapest) plan that ships every BIR compliance item — the factual "full kit" marker
  const fullBir = plans.find((p) => BIR_ROWS.every(([k]) => p.birCompliance?.[k]));
  const noSetupFee = plans.length > 0 && plans.every((p) => !p.price.setupFee);
  const label = (rows: [string, string][], key: string) => d?.[key] || rows.find(([k]) => k === key)?.[1] || key;

  return (
    <MarketingShell>
      <main id="main-content">
        {/* Plans */}
        <section aria-labelledby="pricing-heading" className="relative mk-dark text-white overflow-hidden">
          <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/marketing/boutique-pos.webp" alt="" fetchPriority="high" className="mk-parallax-hero opacity-25 saturate-[0.8] absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#0a1620]/70 via-[#0a1620]/90 to-[#0a1620]" />
          </div>

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-10 md:pt-14 pb-12 md:pb-16">
            <div className="mk-hero-in max-w-3xl mb-8">
              <div className="flex items-center gap-2 mb-4">
                <FKey dark>F1</FKey>
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-muted">{d?.eyebrow || 'Price list'}</span>
              </div>
              <h1 id="pricing-heading" className="text-4xl sm:text-5xl lg:text-[3.25rem] font-black tracking-tight leading-[1.04] mb-4">
                {d?.title || 'One monthly price per store.'}
              </h1>
              <p className="text-[15px] text-white/70 leading-relaxed max-w-2xl">
                {d?.desc || 'Every new store starts on a 14-day free trial — no card needed. Pick a plan when the trial ends; you can move up as you add staff and branches.'}
              </p>
              {noSetupFee && (
                <p className="mt-4 inline-flex items-center gap-1.5 mk-glass rounded-full pl-2 pr-3 py-1 text-xs font-medium text-white/85">
                  <BadgeCheck className="w-3.5 h-3.5 text-emerald-300" strokeWidth={2.5} aria-hidden="true" />
                  {d?.noSetupFee || 'No setup fee on any plan'}
                </p>
              )}
            </div>

            {state === 'loading' ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2" aria-busy="true">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="mk-glass rounded-xl h-80 motion-safe:animate-pulse" />
                ))}
              </div>
            ) : state === 'failed' ? (
              <div className="mk-glass rounded-xl p-8 text-center">
                <h2 className="text-lg font-bold mb-1">{d?.errorTitle || "Couldn't load the price list"}</h2>
                <p className="text-sm text-white/60 mb-5">{d?.errorDesc || 'Check your connection and try again.'}</p>
                <Button
                  type="button"
                  variant="brand"
                  onClick={() => {
                    setState('loading');
                    setAttempt((n) => n + 1);
                  }}
                  className="h-10 px-5"
                >
                  <RotateCw className="w-4 h-4" strokeWidth={2.25} aria-hidden="true" />
                  {d?.retry || 'Try again'}
                </Button>
              </div>
            ) : (
              <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {plans.map((p, i) => {
                  const featured = p._id === fullBir?._id;
                  return (
                    <li
                      key={p._id}
                      style={{ ['--i' as string]: i }}
                      className={`mk-reveal mk-glass backdrop-blur-md rounded-xl p-5 flex flex-col relative ${featured ? 'ring-2 ring-brand-muted' : ''}`}
                    >
                      {featured && (
                        // .mk-key-* sets position: relative, so the absolute positioning lives on a wrapper
                        <span className="absolute -top-2.5 left-5">
                          <span className="mk-key-brand inline-flex items-center h-5 px-2 rounded text-[10px] font-bold font-mono tracking-wider uppercase">
                            {d?.fullBirBadge || 'Full BIR kit'}
                          </span>
                        </span>
                      )}
                      <h2 className="text-lg font-bold mb-1">{p.name}</h2>
                      {p.description && <p className="text-xs text-white/55 leading-snug min-h-8">{p.description}</p>}

                      <div className="mk-lcd rounded-md px-3 py-2.5 my-4 flex items-baseline justify-between gap-2">
                        <span className="text-2xl font-bold tabular-nums leading-none">
                          {p.price.monthly === 0 ? d?.free || 'FREE' : money(p.price.monthly, p.price.currency)}
                        </span>
                        {p.price.monthly > 0 && <span className="text-[10px] uppercase tracking-wider opacity-75">{d?.perMonth || '/ month'}</span>}
                      </div>

                      <dl className="grid grid-cols-2 gap-1.5 mb-5">
                        {LIMIT_ROWS.map(([key]) => (
                          <div key={key} className="rounded-md bg-white/[0.04] border border-white/10 px-2.5 py-1.5">
                            <dt className="text-[10px] uppercase tracking-wider text-white/45 truncate">{label(LIMIT_ROWS, key)}</dt>
                            <dd className="text-sm font-mono font-bold tabular-nums">{limitText(p.features?.[key], d)}</dd>
                          </div>
                        ))}
                      </dl>

                      <Link
                        href="/signup"
                        className={`${featured ? 'mk-key-brand' : 'mk-key'} mk-sheen mt-auto inline-flex items-center justify-center gap-2 h-10 px-4 rounded-md text-sm font-bold`}
                      >
                        {d?.startTrial || 'Start free trial'}
                        <ArrowIcon />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Comparison */}
        {state === 'ready' && plans.length > 0 && (
          <section aria-labelledby="compare-heading" className="bg-[#eef3f5] px-4 sm:px-6 py-12 md:py-16">
            <div className="max-w-7xl mx-auto">
              <SectionHeader
                id="compare-heading"
                fkey="F2"
                eyebrow={d?.compareEyebrow || 'Compare'}
                title={d?.compareTitle || 'What each plan rings up'}
                desc={d?.compareDesc || 'Limits are checked by the till itself — a store that reaches one has to move up a plan to go past it.'}
              />
              <div className="mk-reveal mk-panel rounded-lg overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <caption className="sr-only">{d?.compareTitle || 'What each plan rings up'}</caption>
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th scope="col" className="sticky left-0 bg-white text-left px-4 py-3 text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400 w-1/3">
                        <span className="sr-only">{d?.featureCol || 'Feature'}</span>
                      </th>
                      {plans.map((p) => (
                        <th key={p._id} scope="col" className="px-3 py-3 text-center">
                          <div className="font-bold text-gray-900">{p.name}</div>
                          <div className="text-xs font-mono tabular-nums text-brand">
                            {p.price.monthly === 0 ? d?.free || 'FREE' : money(p.price.monthly, p.price.currency)}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        [d?.groupLimits || 'Limits', LIMIT_ROWS, 'limit'],
                        [d?.groupFeatures || 'At the counter', FEATURE_ROWS, 'features'],
                        [d?.groupBir || 'BIR compliance', BIR_ROWS, 'bir'],
                      ] as const
                    ).map(([group, rows, kind]) => (
                      <Fragment key={kind}>
                        <tr className="bg-[#f3f7f8]">
                          <th scope="colgroup" colSpan={plans.length + 1} className="sticky left-0 text-left px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-brand">
                            {group}
                          </th>
                        </tr>
                        {rows.map(([key]) => (
                          <tr key={key} className="border-t border-gray-100">
                            <th scope="row" className="sticky left-0 bg-white text-left font-medium text-gray-700 px-4 py-2">
                              {label(rows, key)}
                            </th>
                            {plans.map((p) => {
                              if (kind === 'limit') {
                                return (
                                  <td key={p._id} className="px-3 py-2 text-center font-mono tabular-nums text-gray-900">
                                    {limitText(p.features?.[key], d)}
                                  </td>
                                );
                              }
                              const on = kind === 'bir' ? p.birCompliance?.[key] : p.features?.[key];
                              return (
                                <td key={p._id} className="px-3 py-2 text-center">
                                  {on ? (
                                    <Check className="inline w-4 h-4 text-brand" strokeWidth={2.75} aria-label={d?.included || 'Included'} />
                                  ) : (
                                    <Minus className="inline w-4 h-4 text-gray-300" strokeWidth={2.25} aria-label={d?.notIncluded || 'Not included'} />
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* Closing */}
        <section aria-labelledby="pricing-cta-heading" className="mk-dark text-white px-4 sm:px-6 py-12 md:py-16">
          <div className="mk-reveal max-w-7xl mx-auto mk-glass rounded-xl p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FKey dark>↵ ENTER</FKey>
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-muted">{d?.ctaEyebrow || 'Not sure yet'}</span>
              </div>
              <h2 id="pricing-cta-heading" className="text-2xl md:text-3xl font-bold tracking-tight mb-1.5">
                {d?.ctaTitle || 'Run the trial, then decide.'}
              </h2>
              <p className="text-sm text-white/65 max-w-xl">
                {d?.ctaDesc || 'Ring up real sales for 14 days. If you need more branches, staff or BIR paperwork than a plan allows, tell us what your counter looks like.'}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
              <Link href="/signup" className="mk-key-brand mk-sheen inline-flex items-center justify-center gap-2 h-11 px-6 rounded-md font-bold text-sm">
                {d?.startTrial || 'Start free trial'}
                <ArrowIcon className="w-4 h-4" />
              </Link>
              <Link href="/contact" className="mk-key mk-sheen inline-flex items-center justify-center h-11 px-6 rounded-md font-semibold text-sm">
                {d?.talkToUs || 'Talk to us'}
              </Link>
            </div>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
