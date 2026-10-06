'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings, getCurrencySymbol } from '@/lib/currency';
import { useSampleDataManager } from '@/hooks/useSampleDataManager';
import { usePermissions } from '@/hooks/usePermissions';
import { getBusinessTypeLabel, getBusinessTypeBadge } from '@/lib/sample-data-helpers';
import AdminPageHeader from '@/components/admin/AdminPageHeader';

type ItemKey = 'categories' | 'products' | 'customers' | 'discounts';

const PRODUCT_TYPE_BADGE: Record<string, string> = {
  service: 'bg-win8-accent text-white',
  bundle: 'bg-win8-warning text-white',
  regular: 'bg-brand text-white',
};

// Decorative icon per item type (stroke paths, 24x24).
const ITEM_ICON: Record<ItemKey, string> = {
  categories: 'M7 7h.01M3 5v5.59a1 1 0 0 0 .29.7l9.42 9.42a1 1 0 0 0 1.41 0l5.59-5.59a1 1 0 0 0 0-1.41L10.29 4.29A1 1 0 0 0 9.59 4H4a1 1 0 0 0-1 1Z',
  products: 'M21 8 12 3 3 8m18 0-9 5m9-5v8l-9 5m0-8L3 8m9 5v8M3 8v8l9 5',
  customers: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21a8 8 0 0 1 16 0',
  discounts: 'M9 14 15 8M9.5 8.5h.01M14.5 13.5h.01M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a3 3 0 0 0 0 6v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a3 3 0 0 0 0-6V6Z',
};

export default function SampleDataPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';

  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [pageLoading, setPageLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set(['categories', 'products', 'customers', 'discounts']));
  const [productSearch, setProductSearch] = useState('');
  const { preview, previewLoading, installing, message, installResults, loadPreview, installSampleData } = useSampleDataManager(tenant);
  const { canAccess } = usePermissions();
  const canManage = canAccess('sample_data.manage');

  const { settings } = useTenantSettings();
  const tenantSettings = settings || getDefaultTenantSettings();
  const currencySymbol = tenantSettings.currencySymbol || getCurrencySymbol(tenantSettings.currency);

  useEffect(() => {
    getDictionaryClient(lang).then((d) => {
      setDict(d);
      setPageLoading(false);
    });
  }, [lang]);

  useEffect(() => {
    loadPreview();
  }, [tenant, loadPreview]);

  const handleInstall = async () => {
    await installSampleData(Array.from(selectedItems));
  };

  const toggleItem = (key: string, checked: boolean) => {
    const next = new Set(selectedItems);
    if (checked) {
      next.add(key);
    } else {
      next.delete(key);
    }
    setSelectedItems(next);
  };

  if (pageLoading || !dict) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
        <p className="mt-3 text-sm text-gray-400">{dict?.common?.loading || 'Loading…'}</p>
      </div>
    );
  }

  const bizType = preview?.businessType ?? 'general';
  const bizLabel = getBusinessTypeLabel(bizType);

  const hasData = preview && (
    preview.existing.categories > 0 ||
    preview.existing.products > 0 ||
    preview.existing.customers > 0 ||
    preview.existing.discounts > 0
  );

  const itemLabels: Record<ItemKey, string> = {
    categories: dict?.admin?.categories || 'Categories',
    products: dict?.admin?.products || 'Products',
    customers: dict?.admin?.customers || 'Customers',
    discounts: dict?.admin?.discounts || 'Discounts',
  };

  const filteredProducts = preview
    ? preview.sample.products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()))
    : [];

  const installDisabled = installing || previewLoading || selectedItems.size === 0;

  return (
    <div className="px-4 sm:px-6 py-6">
      <AdminPageHeader
        title={dict?.sampleData?.title || 'Install Sample Data'}
        description={dict?.sampleData?.subtitle || 'Quickly populate your store with realistic sample products, categories, customers, and discount codes tailored to your business type.'}
      />

      <div className="space-y-6">
        {/* Status message */}
        {message && (
          <div
            role={message.type === 'error' ? 'alert' : 'status'}
            className={`p-3 bg-white border text-sm font-medium ${
              message.type === 'success' ? 'border-win8-success text-win8-success' : 'border-win8-danger text-win8-danger'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Install results */}
        {installResults && (
          <section className="bg-white border border-gray-300">
            <div className="px-6 py-4 border-b border-gray-300">
              <h2 className="text-base font-bold text-gray-900">{dict?.sampleData?.installationResults || 'Installation Results'}</h2>
            </div>
            <div className="p-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
              {(Object.keys(itemLabels) as ItemKey[]).map((key) => (
                <div key={key} className="bg-white border border-gray-300 p-5">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight">{itemLabels[key]}</p>
                  <p className="text-3xl font-bold tabular-nums text-win8-success mt-1.5">{installResults[key].toLocaleString()}</p>
                  <p className="text-xs text-gray-400 mt-1">{dict?.sampleData?.added || 'added'}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Business type note */}
        {previewLoading ? (
          <div className="bg-white border border-gray-300 p-5 animate-pulse">
            <div className="h-4 bg-gray-200 w-1/3 mb-3" />
            <div className="h-3 bg-gray-200 w-2/3" />
          </div>
        ) : preview && (
          <div className="bg-brand-soft border border-brand p-4 text-sm text-brand-navy">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${getBusinessTypeBadge(bizType)}`}>
                {bizType}
              </span>
              <span className="font-semibold">{bizLabel}</span>
            </div>
            <p>
              {dict?.sampleData?.businessTypeBannerDesc || 'Sample data has been curated specifically for this business type. All records will be added to your store and ready to use immediately.'}
            </p>
          </div>
        )}

        {/* What will be installed */}
        <section className="bg-white border border-gray-300">
          <div className="px-6 py-4 border-b border-gray-300">
            <h2 className="text-base font-bold text-gray-900">{dict?.sampleData?.whatWillBeInstalled || 'What will be installed'}</h2>
            <p className="text-sm text-gray-500">{dict?.sampleData?.onlyNewRecords || 'Only new records will be added — existing data is never overwritten.'}</p>
          </div>

          {previewLoading ? (
            <div className="p-6 space-y-3 animate-pulse">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-gray-200" />)}
            </div>
          ) : preview ? (
            <div className="divide-y divide-gray-200">
              {([
                { key: 'categories', items: preview.sample.categories.join(', ') },
                {
                  key: 'products',
                  items: (dict?.sampleData?.productsAcross || '{products} products across {categories} categories')
                    .replace('{products}', String(preview.preview.products))
                    .replace('{categories}', String(preview.preview.categories)),
                },
                {
                  key: 'customers',
                  items: (dict?.sampleData?.customersWithDetails || '{count} sample customers with contact details and tags')
                    .replace('{count}', String(preview.preview.customers)),
                },
                { key: 'discounts', items: preview.sample.discounts.map(d => `${d.code} (${d.type === 'percentage' ? d.value + '%' : currencySymbol + d.value})`).join(', ') },
              ] as { key: ItemKey; items: string }[]).map(row => {
                const toAdd = preview.preview[row.key];
                const existing = preview.existing[row.key];
                const willAdd = Math.max(0, toAdd - existing);
                const isSelected = selectedItems.has(row.key);
                return (
                  <label
                    key={row.key}
                    className={`px-6 py-4 flex items-start gap-4 transition-colors ${isSelected ? 'bg-brand-soft' : 'hover:bg-gray-100'} ${canManage ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={!canManage}
                      onChange={(e) => toggleItem(row.key, e.target.checked)}
                      className="checkbox-win8 mt-2.5"
                    />
                    <span className="w-9 h-9 shrink-0 bg-brand text-white flex items-center justify-center">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d={ITEM_ICON[row.key]} />
                      </svg>
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">{itemLabels[row.key]}</span>
                        <span className="text-xs text-gray-500 tabular-nums">
                          {toAdd} {dict?.sampleData?.totalInSet || 'total in set'}
                        </span>
                        <span className={`px-2 py-0.5 text-xs font-semibold tabular-nums ${willAdd > 0 ? 'bg-win8-success text-white' : 'bg-gray-500 text-white'}`}>
                          {willAdd > 0
                            ? (dict?.sampleData?.newBadge || '+{count} new').replace('{count}', String(willAdd))
                            : (dict?.sampleData?.alreadyInstalled || 'already installed')}
                        </span>
                      </span>
                      <span className="block text-xs text-gray-500 mt-1 truncate" title={row.items}>{row.items || '—'}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-win8-danger text-sm font-medium">{dict?.sampleData?.couldNotLoadPreview || 'Could not load preview.'}</p>
              <button
                onClick={() => loadPreview()}
                className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
              >
                {dict?.common?.retry || 'Retry'}
              </button>
            </div>
          )}
        </section>

        {/* Products preview */}
        {preview && preview.sample.products.length > 0 && (
          <section className="bg-white border border-gray-300">
            <div className="px-6 py-4 border-b border-gray-300 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-base font-bold text-gray-900">{dict?.sampleData?.sampleProductsPreview || 'Sample Products Preview'}</h2>
                <p className="text-sm text-gray-500 tabular-nums">
                  {(dict?.sampleData?.productsShown || '{shown} of {total} shown')
                    .replace('{shown}', String(filteredProducts.length))
                    .replace('{total}', String(preview.sample.products.length))}
                </p>
              </div>
              <div className="relative">
                <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />
                </svg>
                <input
                  type="text"
                  placeholder={dict?.common?.search || 'Search products...'}
                  aria-label={dict?.common?.search || 'Search products'}
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="pl-8 pr-3 py-2 border border-gray-300 text-sm w-56"
                />
              </div>
            </div>
            {filteredProducts.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                {dict?.sampleData?.noProductsMatch || 'No products match your search'}
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">{dict?.admin?.name || 'Name'}</th>
                      <th className="px-4 py-3 text-left font-medium">{dict?.common?.type || 'Type'}</th>
                      <th className="px-4 py-3 text-right font-medium">{dict?.admin?.price || 'Price'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredProducts.map((p, i) => (
                      <tr key={i} className="hover:bg-gray-100 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 text-xs font-semibold capitalize ${PRODUCT_TYPE_BADGE[p.type] || 'bg-gray-500 text-white'}`}>
                            {p.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900 tabular-nums">
                          {currencySymbol}{p.price.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Install */}
        <section className="bg-white border border-gray-300">
          <div className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-base font-bold text-gray-900">{dict?.sampleData?.readyToInstall || 'Ready to install'}</h2>
              <p className="text-sm text-gray-500">
                {preview && selectedItems.size > 0
                  ? (dict?.sampleData?.willAdd || 'Will add: {items}').replace(
                      '{items}',
                      (Object.keys(itemLabels) as ItemKey[])
                        .filter((k) => selectedItems.has(k))
                        .map((k) => `${preview.preview[k]} ${itemLabels[k]}`)
                        .join(', ')
                    )
                  : (dict?.sampleData?.selectAtLeastOne || 'Select at least one item type to install')}
              </p>
            </div>
            {canManage && (
              <button
                onClick={handleInstall}
                disabled={installDisabled}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {installing ? (
                  <span className="win8-spinner win8-spinner-sm" aria-hidden="true"><span /><span /><span /><span /><span /></span>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                )}
                {installing ? (dict?.sampleData?.installing || 'Installing…') : (dict?.sampleData?.installSampleData || 'Install Sample Data')}
              </button>
            )}
          </div>
          {hasData && (
            <div className="px-6 pb-4">
              <div className="p-3 bg-white border border-win8-warning text-sm">
                <p className="font-semibold text-win8-warning">{dict?.sampleData?.storeHasData || 'This store already has data'}</p>
                <p className="text-gray-700 mt-0.5">
                  {dict?.sampleData?.storeHasDataDesc || 'Existing records will not be modified. Only new sample records (those not already present) will be added.'}
                </p>
              </div>
            </div>
          )}
        </section>

        <p className="text-xs text-gray-400">
          {dict?.sampleData?.infoNote || 'Sample data is intended for testing and demo purposes. You can delete individual records from their respective management screens at any time.'}
        </p>
      </div>
    </div>
  );
}
