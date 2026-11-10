'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Tags } from 'lucide-react';
import { ReceiptRow } from '@/components/marketing/primitives';
import { Empty, Printing, SaPage, Strip, Tag } from '@/components/super-admin/ui';
import { OFFERED_BUSINESS_TYPES, isBusinessTypeOffered } from '@/lib/business-types';

interface BusinessTypeConfig {
  type: string;
  name: string;
  description: string;
  defaultFeatures: Record<string, boolean>;
  productTypes: string[];
}

const FEATURE_LABELS: Record<string, string> = {
  enableInventory: 'Inventory',
  enableCategories: 'Categories',
  enableDiscounts: 'Discounts',
  enableLoyaltyProgram: 'Loyalty Program',
  enableCustomerManagement: 'Customer Management',
  enableBookingScheduling: 'Booking & Scheduling',
};

export default function BusinessTypesPage() {
  const [types, setTypes] = useState<BusinessTypeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/business-types')
      .then(res => res.json())
      .then(data => {
        if (data.success) setTypes(data.data);
        else setLoadError(true);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  // Offered types first, in the order pickers show them; closed types are kept for tenants already on them.
  const offered = OFFERED_BUSINESS_TYPES
    .map(type => types.find(bt => bt.type === type))
    .filter((bt): bt is BusinessTypeConfig => Boolean(bt));
  const closed = types.filter(bt => !isBusinessTypeOffered(bt.type));

  const renderCard = (bt: BusinessTypeConfig, i: number, muted: boolean) => {
    const open = expanded === bt.type;
    return (
      <div key={bt.type}>
        <div className={muted ? 'bg-paper text-ink/80' : 'bg-paper-white text-ink'}>
          <button
            type="button"
            aria-expanded={open}
            className={`block w-full text-left transition-colors ${muted ? 'px-4 py-3 hover:bg-paper-white' : 'px-5 py-4 hover:bg-paper'}`}
            onClick={() => setExpanded(open ? null : bt.type)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-receipt text-xs text-ink/50">{String(i + 1).padStart(2, '0')}</p>
                <h3 className={muted ? 'mt-1 text-base font-semibold' : 'mt-1 font-display text-3xl font-extrabold uppercase leading-none'}>{bt.name}</h3>
                <p className="mt-1 text-sm text-ink/65">{bt.description}</p>
              </div>
              {open ? (
                <ChevronUp className="mt-1 h-5 w-5 shrink-0 text-ink/50" strokeWidth={1.75} aria-hidden />
              ) : (
                <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-ink/50" strokeWidth={1.75} aria-hidden />
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-1">
              {muted && <Tag tone="muted">Not offered</Tag>}
              {bt.productTypes.map(pt => (
                <Tag key={pt}>{pt}</Tag>
              ))}
            </div>
          </button>

          {open && (
            <div className="border-t border-dashed border-ink/30 px-5 py-4">
              <p className="mb-2 font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/60">Default features</p>
              <div className="space-y-1.5 font-receipt text-sm">
                {Object.entries(bt.defaultFeatures).map(([key, enabled]) => (
                  <ReceiptRow
                    key={key}
                    label={FEATURE_LABELS[key] || key}
                    value={<span className={enabled ? 'font-semibold text-brand-hover' : 'text-ink/45'}>{enabled ? 'ON' : 'OFF'}</span>}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
        {!muted && <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />}
      </div>
    );
  };

  return (
    <SaPage
      tagNo="04"
      tag="Store setups"
      title="Business types"
      subtitle="New tenants can only be set up as Retail or General. Other setups stay in code for the stores already running on them."
    >
      <div className="mt-6 max-w-3xl">
        <Strip tone="ok">
          These are set in code. To change one, update <code>lib/business-types.ts</code> and deploy. This page only shows the current setup.
        </Strip>
      </div>

      <section className="mt-8" aria-busy={loading} aria-label="Offered business types">
        {loading ? (
          <div className="bg-paper-white text-ink">
            <Printing />
          </div>
        ) : loadError ? (
          <Strip tone="error">The business types didn’t load. Reload the page to try again.</Strip>
        ) : offered.length === 0 ? (
          <div className="bg-paper-white text-ink">
            <Empty icon={<Tags className="h-8 w-8" strokeWidth={1.75} aria-hidden />}>No business types found</Empty>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-6 sm:grid-cols-2">
            {offered.map((bt, i) => renderCard(bt, i, false))}
          </div>
        )}
      </section>

      {!loading && !loadError && closed.length > 0 && (
        <section className="mt-12" aria-labelledby="closed-types">
          <h2 id="closed-types" className="text-3xl text-paper-white sm:text-4xl">No longer offered</h2>
          <p className="mt-2 max-w-2xl text-sm text-paper/70">
            New tenants can’t pick these, and an existing tenant can’t be switched to one. Stores already on them keep running with these defaults.
          </p>
          <div className="mt-5 grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {closed.map((bt, i) => renderCard(bt, offered.length + i, true))}
          </div>
        </section>
      )}
    </SaPage>
  );
}
