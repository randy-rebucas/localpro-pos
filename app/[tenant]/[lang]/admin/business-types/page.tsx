'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowRight, Check, Minus } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { ICON, DARK_KEY, LedReadout, RegisterPage } from '@/components/admin/register-ui';
import { getDictionaryClient } from '../../dictionaries-client';
import { type TranslationDict } from '@/types/dictionary';
import { type ITenantSettings } from '@/types/tenant';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { BUSINESS_TYPE_CONFIGS, getBusinessTypeConfig, isBusinessTypeOpenForSignup, type BusinessType } from '@/lib/business-types';
import { getBusinessType } from '@/lib/business-type-helpers';

/** The switches a business type presets, in the order a store owner would read them. */
const FEATURES = [
  'enableInventory',
  'enableCategories',
  'enableDiscounts',
  'enableLoyaltyProgram',
  'enableCustomerManagement',
  'enableBookingScheduling',
] as const;
type FeatureKey = (typeof FEATURES)[number];

/** Retail and General, the types on offer. */
const OFFERED = (Object.keys(BUSINESS_TYPE_CONFIGS) as BusinessType[]).filter((type) => isBusinessTypeOpenForSignup(type));

export default function BusinessTypesPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const { settings } = useTenantSettings();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  if (!dict || !settings) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  const t = (key: string, fallback: string) => dict.admin?.[key] || fallback;
  const base = `/${tenant}/${lang}/admin`;

  const featureLabel: Record<FeatureKey, string> = {
    enableInventory: t('featureInventory', 'Inventory'),
    enableCategories: t('featureCategories', 'Categories'),
    enableDiscounts: t('featureDiscounts', 'Discounts'),
    enableLoyaltyProgram: t('featureLoyalty', 'Loyalty points'),
    enableCustomerManagement: t('featureCustomers', 'Customer records'),
    enableBookingScheduling: t('featureBookings', 'Bookings'),
  };
  const typeName = (type: string): string => {
    const s = (key: string, fallback: string) => {
      const v = dict.settings?.[key];
      return typeof v === 'string' && v ? v : fallback;
    };
    if (type === 'retail') return s('businessTypeRetail', 'Retail Store');
    if (type === 'general') return s('businessTypeGeneralOption', 'General');
    // A store still on a type that is no longer offered keeps seeing its own name.
    return getBusinessTypeConfig(type).name;
  };
  const typeBlurb = (type: string): string | null => {
    if (type === 'retail') return t('businessTypeRetailBlurb', 'For shops that sell stocked goods: SKUs, stock counts and bundles.');
    if (type === 'general') return t('businessTypeGeneralBlurb', 'For any other counter: goods and services on one register.');
    return null;
  };
  const productTypeLabel = (pt: string): string =>
    pt === 'regular' ? t('productTypeRegular', 'Items')
      : pt === 'bundle' ? t('productTypeBundle', 'Bundles')
        : pt === 'service' ? t('productTypeService', 'Services')
          : pt;

  const current = getBusinessType(settings);
  const config = getBusinessTypeConfig(current);
  // What the store actually runs: its own switch where set, otherwise the type's preset.
  const effective = (key: FeatureKey) => {
    const own = (settings as ITenantSettings & Record<string, unknown>)[key];
    return typeof own === 'boolean' ? own : !!config.defaultFeatures[key];
  };
  const onCount = FEATURES.filter(effective).length;
  const changedCount = FEATURES.filter((key) => effective(key) !== !!config.defaultFeatures[key]).length;

  return (
    <RegisterPage
      tagNo="BT"
      tag={settings.companyName}
      title={t('businessTypes', 'Business Type')}
      subtitle={t('businessTypesSubtitle', 'What your type turns on, and where your store differs.')}
      side={<LedReadout value={`${onCount}/${FEATURES.length}`} label={t('featuresOn', 'Features on')} />}
    >
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Your store, as it is set up now */}
        <section aria-labelledby="your-type-heading" className="min-w-0">
          <div className="bg-paper-white px-4 py-4 text-ink sm:px-5">
            <p className="font-receipt text-xs uppercase tracking-[0.14em] text-ink/60">{t('currentBusinessType', 'Your business type')}</p>
            <h2 id="your-type-heading" className="mt-1 break-words text-4xl sm:text-5xl">{typeName(current)}</h2>
            {typeBlurb(current) && <p className="mt-2 text-sm text-ink/70">{typeBlurb(current)}</p>}

            <ul className="mt-4 divide-y divide-dashed divide-ink/20 border-t border-dashed border-ink/30">
              {FEATURES.map((key) => {
                const on = effective(key);
                const changed = on !== !!config.defaultFeatures[key];
                return (
                  <li key={key} className="flex items-center gap-3 py-2.5">
                    {on
                      ? <Check className="h-4 w-4 shrink-0 text-brand-hover" strokeWidth={1.75} aria-hidden />
                      : <Minus className="h-4 w-4 shrink-0 text-ink/30" strokeWidth={1.75} aria-hidden />}
                    <span className={`flex-1 text-sm ${on ? '' : 'text-ink/50'}`}>{featureLabel[key]}</span>
                    {changed && (
                      <span className="font-receipt text-[11px] uppercase tracking-[0.08em] text-ink/50">{t('differsFromPreset', 'Differs')}</span>
                    )}
                    <span className="w-12 text-right font-receipt text-xs font-medium uppercase">{on ? t('featureOn', 'On') : t('featureOff', 'Off')}</span>
                  </li>
                );
              })}
            </ul>

            <p className="mt-3 border-t border-dashed border-ink/30 pt-3 font-receipt text-xs text-ink/60">
              {changedCount > 0
                ? t('differFromPresetCount', '{count} differ from the {type} preset.').replace('{count}', String(changedCount)).replace('{type}', typeName(current))
                : t('matchesPreset', 'Matches the {type} preset.').replace('{type}', typeName(current))}
            </p>
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`${base}/feature-flags`} className={DARK_KEY}>
              {t('changeFeatures', 'Turn features on or off')}
              <ArrowRight className={ICON} strokeWidth={1.75} aria-hidden />
            </Link>
            <Link href={`${base}/settings`} className={DARK_KEY}>
              {t('changeBusinessType', 'Change business type')}
              <ArrowRight className={ICON} strokeWidth={1.75} aria-hidden />
            </Link>
          </div>
        </section>

        {/* The types on offer, side by side like a price list */}
        <section aria-labelledby="compare-heading" className="min-w-0">
          <div className="bg-paper-white px-4 py-4 text-ink sm:px-5">
            <h2 id="compare-heading" className="text-4xl">{t('compareBusinessTypes', 'Compare types')}</h2>
            <p className="mt-1 text-sm text-ink/70">{t('compareBusinessTypesHint', 'What each type turns on when it is chosen. You can still change any switch afterwards.')}</p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[20rem] border-collapse text-sm">
                <caption className="sr-only">{t('compareBusinessTypes', 'Compare types')}</caption>
                <thead>
                  <tr className="border-b-2 border-ink">
                    <th scope="col" className="py-2 pr-3 text-left font-receipt text-xs font-medium uppercase tracking-[0.08em] text-ink/60">{t('feature', 'Feature')}</th>
                    {OFFERED.map((type) => (
                      <th key={type} scope="col" className="w-28 px-2 py-2 text-center align-bottom">
                        {type === current && (
                          <span className="mb-1 inline-block bg-brand px-1.5 py-0.5 font-receipt text-[10px] font-medium uppercase tracking-[0.08em] text-ink">{t('yoursTag', 'Yours')}</span>
                        )}
                        <span className="block font-display text-xl font-bold uppercase leading-none">{typeName(type)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FEATURES.map((key) => (
                    <tr key={key} className="border-b border-dashed border-ink/20">
                      <th scope="row" className="py-2.5 pr-3 text-left font-normal">{featureLabel[key]}</th>
                      {OFFERED.map((type) => {
                        const on = !!BUSINESS_TYPE_CONFIGS[type].defaultFeatures[key];
                        return (
                          <td key={type} className={`px-2 py-2.5 text-center ${type === current ? 'bg-brand/10' : ''}`}>
                            {on
                              ? <Check className="mx-auto h-4 w-4 text-brand-hover" strokeWidth={1.75} aria-label={t('featureOn', 'On')} />
                              : <Minus className="mx-auto h-4 w-4 text-ink/30" strokeWidth={1.75} aria-label={t('featureOff', 'Off')} />}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" className="py-2.5 pr-3 text-left align-top font-normal">{t('sells', 'Sells')}</th>
                    {OFFERED.map((type) => (
                      <td key={type} className={`px-2 py-2.5 text-center align-top font-receipt text-xs ${type === current ? 'bg-brand/10' : ''}`}>
                        {BUSINESS_TYPE_CONFIGS[type].productTypes.map(productTypeLabel).join(', ')}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </section>
      </div>
    </RegisterPage>
  );
}
