'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { PackagePlus, Search } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Currency from '@/components/Currency';
import { Barcode, ReceiptRow } from '@/components/marketing/primitives';
import {
  CHECK_ROW, CHECKBOX, ICON, INPUT, KEY_PRIMARY,
  LedReadout, RegisterPage, Strip,
} from '@/components/admin/register-ui';
import { getDictionaryClient } from '../../dictionaries-client';
import { useSampleDataManager, type PreviewData } from '@/hooks/useSampleDataManager';
import { usePermissions } from '@/hooks/usePermissions';
import { useConfirm } from '@/lib/confirm';

type Dict = Record<string, Record<string, unknown> | undefined>;
type ItemKey = keyof PreviewData['preview'];

const ITEMS: ItemKey[] = ['categories', 'products', 'customers', 'discounts'];
const SLIP = 'bg-paper-white p-5 text-ink sm:p-6';

/** The sample set the server picked: Retail for retail stores, General for everyone else. */
const BIZ_LABEL_KEYS: Record<string, [string, string]> = {
  retail: ['businessTypeRetail', 'Retail Store'],
  general: ['businessTypeGeneralOption', 'General'],
};

export default function SampleDataPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const { canAccess } = usePermissions();
  const canManage = canAccess('sample_data.manage');
  const { confirm, Dialog: ConfirmDialog } = useConfirm();

  const [dict, setDict] = useState<Dict | null>(null);
  const [selected, setSelected] = useState<Set<ItemKey>>(new Set(ITEMS));
  const [productSearch, setProductSearch] = useState('');
  const { preview, previewLoading, installing, message, installResults, loadPreview, installSampleData } = useSampleDataManager(tenant);

  useEffect(() => {
    getDictionaryClient(lang).then((d) => setDict(d as unknown as Dict));
  }, [lang]);

  // The preview route needs sample_data.manage; without it there is nothing to show.
  useEffect(() => {
    if (canManage) loadPreview();
  }, [canManage, loadPreview]);

  const t = useCallback((key: string, fallback: string) => {
    const v = dict?.sampleData?.[key];
    return typeof v === 'string' ? v : fallback;
  }, [dict]);
  const tr = useCallback((section: string, key: string, fallback: string) => {
    const v = dict?.[section]?.[key];
    return typeof v === 'string' ? v : fallback;
  }, [dict]);

  const itemLabel = useCallback((key: ItemKey) => ({
    categories: tr('admin', 'categories', 'Categories'),
    products: tr('admin', 'products', 'Products'),
    customers: tr('admin', 'customers', 'Customers'),
    discounts: tr('admin', 'discounts', 'Discounts'),
  })[key], [tr]);

  /** Sample records of this kind not in the store yet. */
  const toAdd = useCallback((key: ItemKey) => {
    if (!preview) return 0;
    return preview.missing?.[key] ?? Math.max(0, preview.preview[key] - preview.existing[key]);
  }, [preview]);

  const addCount = useMemo(
    () => ITEMS.filter((k) => selected.has(k)).reduce((sum, k) => sum + toAdd(k), 0),
    [selected, toAdd],
  );

  const products = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return (preview?.sample.products ?? []).filter((p) => p.name.toLowerCase().includes(q));
  }, [preview, productSearch]);

  const toggle = (key: ItemKey, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key); else next.delete(key);
      return next;
    });
  };

  const handleInstall = async () => {
    const keys = ITEMS.filter((k) => selected.has(k));
    const ok = await confirm(
      t('confirmInstallTitle', 'Add sample data to this store?'),
      t('confirmInstallMessage', 'This adds up to {count} sample record(s) to your live store: {items}. Remove them from their own screens when you are done.')
        .replace('{count}', String(addCount))
        .replace('{items}', keys.map(itemLabel).join(', ')),
      { confirmText: t('installSampleData', 'Install Sample Data'), cancelText: tr('common', 'cancel', 'Cancel'), variant: 'warning' },
    );
    if (!ok) return;
    await installSampleData(keys);
  };

  if (!dict) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-brand-navy-deep">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const bizType = preview?.businessType ?? 'general';
  const [bizKey, bizFallback] = BIZ_LABEL_KEYS[bizType] ?? [bizType, bizType];
  const bizLabel = tr('settings', bizKey, bizFallback);
  const hasData = !!preview && ITEMS.some((k) => preview.existing[k] > 0);
  const firstLoad = previewLoading && !preview;

  const typeLabel = (type: string) => ({
    regular: t('typeRegular', 'Item'),
    service: t('typeService', 'Service'),
    bundle: t('typeBundle', 'Bundle'),
  } as Record<string, string>)[type] ?? type;

  const itemDetail = (key: ItemKey) => {
    if (!preview) return null;
    switch (key) {
      case 'categories':
        return preview.sample.categories.join(', ');
      case 'products':
        return t('productsDetail', '{count} items across {categories} categories')
          .replace('{count}', String(preview.preview.products))
          .replace('{categories}', String(preview.preview.categories));
      case 'customers':
        return t('customersDetailSample', '{count} customers named “Sample Customer”, with no phone or email')
          .replace('{count}', String(preview.preview.customers));
      case 'discounts':
        return preview.sample.discounts.map((d) => (
          <span key={d.code} className="mr-3 inline-block whitespace-nowrap">
            {d.code} · {d.type === 'percentage' ? `${d.value}%` : <Currency amount={d.value} />}
          </span>
        ));
    }
  };

  return (
    <RegisterPage
      tag={t('tag', 'Training mode')}
      tagNo="TR"
      title={t('titleShort', 'Sample data')}
      subtitle={t('subtitleShort', 'Load a made-up catalog, customers and coupons to practise on before you open.')}
      side={canManage && preview ? <LedReadout value={String(addCount).padStart(2, '0')} label={t('toAddLed', 'to add')} /> : undefined}
    >
      {!canManage ? (
        <div className="mt-8">
          <Strip tone="error">{t('accessRestricted', 'You don’t have permission to install sample data. Contact an admin or owner.')}</Strip>
        </div>
      ) : firstLoad ? (
        <div className="flex justify-center py-24"><LoadingSpinner size="lg" /></div>
      ) : !preview ? (
        <div className="mt-8">
          <Strip tone="error">{t('couldNotLoadPreview', 'Could not load preview.')}</Strip>
        </div>
      ) : (
        <>
          {message?.type === 'error' && (
            <div className="mt-8"><Strip tone="error">{t('installFailed', 'Sample data could not be installed. Nothing was changed if no counts appear below.')}</Strip></div>
          )}

          <div className="mt-8 grid gap-6 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-7">
              {/* Training kit */}
              <section className={SLIP} aria-labelledby="kit-heading">
                <p className="font-receipt text-xs uppercase tracking-[0.14em] text-ink/60">01 · {bizLabel}</p>
                <h2 id="kit-heading" className="text-3xl sm:text-4xl">{t('whatWillBeInstalled', 'What will be installed')}</h2>
                <p className="mt-1 text-sm text-ink/70">{t('onlyNewRecords', 'Only new records will be added — existing data is never overwritten.')}</p>

                <ul className="mt-4 divide-y divide-dashed divide-ink/25 border-y border-dashed border-ink/25">
                  {ITEMS.map((key) => {
                    const n = toAdd(key);
                    return (
                      <li key={key} className="py-2">
                        <label className={`${CHECK_ROW} items-start`}>
                          <input
                            type="checkbox"
                            className={`${CHECKBOX} mt-3`}
                            checked={selected.has(key)}
                            disabled={installing}
                            onChange={(e) => toggle(key, e.target.checked)}
                          />
                          <span className="min-w-0 flex-1 py-2">
                            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                              <span className="font-semibold">{itemLabel(key)}</span>
                              <span className="font-receipt text-xs uppercase tracking-[0.08em] text-ink/60">
                                {preview.preview[key]} {t('totalInSet', 'total in set')}
                              </span>
                              <span className={`font-receipt text-xs uppercase tracking-[0.08em] ${n > 0 ? 'text-brand-hover' : 'text-ink/45'}`}>
                                {n > 0 ? t('newBadge', '+{count} new').replace('{count}', String(n)) : t('alreadyInstalled', 'already installed')}
                              </span>
                            </span>
                            <span className="mt-1 block text-sm text-ink/65">{itemDetail(key)}</span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>

              {/* Sample price list */}
              {preview.sample.products.length > 0 && (
                <section className="drop-shadow-[0_10px_18px_rgba(0,0,0,0.35)]" aria-labelledby="pricelist-heading">
                  <div className={`${SLIP} font-receipt`}>
                    <div className="text-center">
                      <p className="text-xs uppercase tracking-[0.2em] text-ink/60">{t('trainingBanner', '*** Training mode ***')}</p>
                      <h3 id="pricelist-heading" className="mt-1 font-receipt text-lg font-semibold uppercase tracking-[0.08em]">
                        {t('sampleProductsPreview', 'Sample Products Preview')}
                      </h3>
                      <p className="text-xs text-ink/60">{t('sampleStoreName', 'YOUR STORE NAME')}</p>
                    </div>

                    <div className="relative mt-4">
                      <Search className={`${ICON} pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40`} strokeWidth={1.75} aria-hidden />
                      <input
                        type="search"
                        aria-label={t('searchProducts', 'Search sample products')}
                        placeholder={t('searchProducts', 'Search sample products')}
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        className={`${INPUT} pl-9 font-body`}
                      />
                    </div>

                    <div className="mt-4 space-y-1.5 border-t border-dashed border-ink/30 pt-3 text-sm">
                      {products.map((p) => (
                        <ReceiptRow
                          key={p.name}
                          label={
                            <span className="min-w-0">
                              {p.name}
                              {p.type !== 'regular' && (
                                <span className="ml-2 border border-ink/25 px-1 text-[10px] uppercase tracking-[0.08em] text-ink/60">{typeLabel(p.type)}</span>
                              )}
                            </span>
                          }
                          value={<Currency amount={p.price} />}
                        />
                      ))}
                      {products.length === 0 && (
                        <p className="py-4 text-center text-ink/60">{t('noProductsMatch', 'No products match your search')}</p>
                      )}
                    </div>

                    <div className="mt-4 border-t border-dashed border-ink/30 pt-3 text-center">
                      <Barcode className="mx-auto h-8 w-40 text-ink/70" />
                      <p className="mt-2 text-xs uppercase tracking-[0.14em] text-ink/60">{tr('admin', 'proofSampleNote', 'Sample only · not a receipt')}</p>
                    </div>
                  </div>
                  <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
                </section>
              )}
            </div>

            <div className="space-y-6 lg:col-span-5">
              {hasData && (
                <Strip tone="ok">
                  <span className="font-semibold">{t('storeHasData', 'This store already has data')}.</span>{' '}
                  {t('storeHasDataDesc', 'Existing records will not be modified. Only new sample records (those not already present) will be added.')}
                </Strip>
              )}

              {/* Install */}
              <section className={SLIP} aria-labelledby="install-heading">
                <p className="font-receipt text-xs uppercase tracking-[0.14em] text-ink/60">02</p>
                <h2 id="install-heading" className="text-3xl sm:text-4xl">{t('readyToInstall', 'Ready to install')}</h2>
                <div className="mt-4 space-y-1 border-t border-dashed border-ink/30 pt-4 font-receipt text-sm">
                  {ITEMS.filter((k) => selected.has(k)).map((k) => (
                    <ReceiptRow key={k} label={itemLabel(k)} value={`+${toAdd(k)}`} />
                  ))}
                  {selected.size === 0 && <p className="text-ink/60">{t('selectAtLeastOne', 'Select at least one item type to install')}</p>}
                  {selected.size > 0 && (
                    <div className="border-t border-dashed border-ink/30 pt-2">
                      <ReceiptRow strong label={t('totalToAdd', 'Records to add')} value={addCount} />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleInstall}
                  disabled={installing || previewLoading || selected.size === 0 || addCount === 0}
                  className={`${KEY_PRIMARY} mt-4 w-full sm:w-auto`}
                >
                  {installing ? <LoadingSpinner size="sm" /> : <PackagePlus className={ICON} strokeWidth={1.75} aria-hidden />}
                  {installing ? t('installing', 'Installing…') : t('installSampleData', 'Install Sample Data')}
                </button>
                {selected.size > 0 && addCount === 0 && (
                  <p className="mt-2 font-receipt text-xs text-ink/60">{t('nothingToAdd', 'Everything selected is already in the store.')}</p>
                )}

                {installResults && (
                  <div className="mt-5 border-t border-dashed border-ink/30 pt-4 font-receipt text-sm" role="status">
                    <p className="mb-2 text-xs uppercase tracking-[0.14em] text-ink/60">{t('installationResults', 'Installation Results')}</p>
                    <div className="space-y-1">
                      {ITEMS.map((k) => (
                        <ReceiptRow key={k} label={itemLabel(k)} value={`+${installResults[k]}`} />
                      ))}
                    </div>
                  </div>
                )}
              </section>

              <p className="font-receipt text-xs leading-relaxed text-white/60">
                {t('infoNote', 'Sample data is intended for testing and demo purposes. You can delete individual records from their respective management screens at any time.')}
              </p>
            </div>
          </div>
        </>
      )}
      {ConfirmDialog}
    </RegisterPage>
  );
}
