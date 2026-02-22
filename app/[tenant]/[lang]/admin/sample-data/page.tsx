'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';

interface PreviewData {
  businessType: string;
  preview: { categories: number; products: number; customers: number; discounts: number };
  existing: { categories: number; products: number; customers: number; discounts: number };
  sample: {
    categories: string[];
    products: { name: string; price: number; type: string }[];
    discounts: { code: string; name: string; value: number; type: string }[];
  };
}

const BIZ_TYPE_LABELS: Record<string, string> = {
  retail:     'Retail Store',
  restaurant: 'Restaurant / Food Service',
  laundry:    'Laundry Service',
  service:    'Service Business (Salon, Spa, etc.)',
  general:    'General Business',
};

const BIZ_TYPE_COLORS: Record<string, string> = {
  retail:     'blue',
  restaurant: 'orange',
  laundry:    'cyan',
  service:    'purple',
  general:    'green',
};

export default function SampleDataPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';

  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [pageLoading, setPageLoading] = useState(true);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [installResults, setInstallResults] = useState<PreviewData['preview'] & { skipped?: PreviewData['preview'] } | null>(null);

  const { settings } = useTenantSettings();
  const tenantSettings = settings || getDefaultTenantSettings();
  const primaryColor = tenantSettings.primaryColor || '#2563eb';

  useEffect(() => {
    getDictionaryClient(lang).then((d) => {
      setDict(d);
      setPageLoading(false);
    });
  }, [lang]);

  useEffect(() => {
    async function loadPreview() {
      try {
        setPreviewLoading(true);
        const res = await fetch(`/api/tenants/${tenant}/seed-sample-data`, { credentials: 'include' });
        const data = await res.json();
        if (data.success) setPreview(data.data);
      } catch {
        // silently fail — no preview
      } finally {
        setPreviewLoading(false);
      }
    }
    loadPreview();
  }, [tenant]);

  const handleInstall = async () => {
    if (installing) return;
    setInstalling(true);
    setMessage(null);
    setInstallResults(null);
    try {
      const res = await fetch(`/api/tenants/${tenant}/seed-sample-data`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skipExisting: true }),
      });
      const data = await res.json();
      if (data.success) {
        const r = data.data.results;
        setInstallResults({
          categories: r.categories.created,
          products:   r.products.created,
          customers:  r.customers.created,
          discounts:  r.discounts.created,
        });
        setMessage({
          type: 'success',
          text: `Sample data installed successfully! ${r.categories.created + r.products.created + r.customers.created + r.discounts.created} records added.`,
        });
        // Refresh preview counts
        const res2 = await fetch(`/api/tenants/${tenant}/seed-sample-data`, { credentials: 'include' });
        const data2 = await res2.json();
        if (data2.success) setPreview(data2.data);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to install sample data.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'An unexpected error occurred.' });
    } finally {
      setInstalling(false);
    }
  };

  if (pageLoading || !dict) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 rounded-full" style={{ borderColor: primaryColor }} />
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  const bizType = preview?.businessType ?? 'general';
  const bizLabel = BIZ_TYPE_LABELS[bizType] ?? bizType;
  const colorKey = BIZ_TYPE_COLORS[bizType] ?? 'blue';

  const colorMap: Record<string, { bg: string; border: string; text: string; badge: string }> = {
    blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',  text: 'text-blue-700',   badge: 'bg-blue-100 text-blue-800'   },
    orange: { bg: 'bg-orange-50', border: 'border-orange-200',text: 'text-orange-700', badge: 'bg-orange-100 text-orange-800'},
    cyan:   { bg: 'bg-cyan-50',   border: 'border-cyan-200',  text: 'text-cyan-700',   badge: 'bg-cyan-100 text-cyan-800'   },
    purple: { bg: 'bg-purple-50', border: 'border-purple-200',text: 'text-purple-700', badge: 'bg-purple-100 text-purple-800'},
    green:  { bg: 'bg-green-50',  border: 'border-green-200', text: 'text-green-700',  badge: 'bg-green-100 text-green-800' },
  };
  const colors = colorMap[colorKey];

  const hasData = preview && (
    preview.existing.categories > 0 ||
    preview.existing.products > 0 ||
    preview.existing.customers > 0 ||
    preview.existing.discounts > 0
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <Link
            href={`/${tenant}/${lang}/admin`}
            className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium mb-4 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {dict?.admin?.backToAdmin || 'Back to Admin'}
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Install Sample Data</h1>
          <p className="text-gray-600">
            Quickly populate your store with realistic sample products, categories, customers, and discount codes tailored to your business type.
          </p>
        </div>

        {/* Status message */}
        {message && (
          <div className={`mb-6 p-4 border flex items-start gap-3 ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border-green-300'
              : 'bg-red-50 text-red-800 border-red-300'
          }`}>
            {message.type === 'success' ? (
              <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            ) : (
              <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* Install results */}
        {installResults && (
          <div className="mb-6 bg-white border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Installation Results</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {([
                { label: 'Categories', value: installResults.categories, icon: '🏷️' },
                { label: 'Products',   value: installResults.products,   icon: '📦' },
                { label: 'Customers',  value: installResults.customers,  icon: '👤' },
                { label: 'Discounts',  value: installResults.discounts,  icon: '🎫' },
              ] as { label: string; value: number; icon: string }[]).map(stat => (
                <div key={stat.label} className="text-center p-4 bg-gray-50 border border-gray-200">
                  <div className="text-2xl mb-1">{stat.icon}</div>
                  <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
                  <div className="text-sm text-gray-500">{stat.label} added</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-6">
          {/* Business type banner */}
          {previewLoading ? (
            <div className="bg-white border border-gray-200 p-6 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-1/3 mb-3" />
              <div className="h-4 bg-gray-200 rounded w-2/3" />
            </div>
          ) : preview && (
            <div className={`border p-5 ${colors.bg} ${colors.border}`}>
              <div className="flex items-center gap-3 mb-1">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${colors.badge}`}>
                  {bizType}
                </span>
                <h2 className={`font-semibold ${colors.text}`}>{bizLabel}</h2>
              </div>
              <p className="text-sm text-gray-600">
                Sample data has been curated specifically for this business type. All records will be added to your store and ready to use immediately.
              </p>
            </div>
          )}

          {/* Preview table */}
          <div className="bg-white border border-gray-300">
            <div className="px-5 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">What will be installed</h2>
              <p className="text-sm text-gray-500 mt-0.5">Only new records will be added — existing data is never overwritten.</p>
            </div>

            {previewLoading ? (
              <div className="p-6 space-y-3 animate-pulse">
                {[1,2,3,4].map(i => <div key={i} className="h-12 bg-gray-100 rounded" />)}
              </div>
            ) : preview ? (
              <div className="divide-y divide-gray-100">
                {([
                  { key: 'categories', label: 'Categories', icon: '🏷️', items: preview.sample.categories.join(', ') },
                  { key: 'products',   label: 'Products',   icon: '📦', items: `${preview.preview.products} products across ${preview.preview.categories} categories` },
                  { key: 'customers',  label: 'Customers',  icon: '👤', items: `${preview.preview.customers} sample customers with contact details and tags` },
                  { key: 'discounts',  label: 'Discounts',  icon: '🎫', items: preview.sample.discounts.map(d => `${d.code} (${d.type === 'percentage' ? d.value + '%' : '₱' + d.value} off)`).join(', ') },
                ] as { key: keyof typeof preview.preview; label: string; icon: string; items: string }[]).map(row => {
                  const toAdd    = preview.preview[row.key];
                  const existing = preview.existing[row.key];
                  const willAdd  = Math.max(0, toAdd - existing);
                  return (
                    <div key={row.key} className="px-5 py-4 flex items-start gap-4">
                      <span className="text-xl mt-0.5">{row.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900">{row.label}</span>
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                            {toAdd} total in set
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            willAdd > 0
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}>
                            {willAdd > 0 ? `+${willAdd} new` : `already installed`}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1 truncate">{row.items}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-center text-gray-500">Could not load preview.</div>
            )}
          </div>

          {/* Products preview */}
          {preview && preview.sample.products.length > 0 && (
            <div className="bg-white border border-gray-300">
              <div className="px-5 py-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">Sample Products Preview</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.sample.products.map((p, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-5 py-3 text-sm text-gray-900">{p.name}</td>
                        <td className="px-5 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            p.type === 'service' ? 'bg-purple-100 text-purple-700' :
                            p.type === 'bundle'  ? 'bg-amber-100  text-amber-700'  :
                                                    'bg-blue-100   text-blue-700'
                          }`}>
                            {p.type}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-sm text-right font-medium text-gray-900">
                          ₱{p.price.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Warning if data exists */}
          {hasData && (
            <div className="bg-yellow-50 border border-yellow-200 p-4 flex items-start gap-3">
              <svg className="w-5 h-5 text-yellow-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-yellow-800">This store already has data</p>
                <p className="text-sm text-yellow-700 mt-0.5">
                  Existing records will not be modified. Only new sample records (those not already present) will be added.
                </p>
              </div>
            </div>
          )}

          {/* Action button */}
          <div className="bg-white border border-gray-300 p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="font-semibold text-gray-900">Ready to install</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {preview
                    ? `${preview.preview.products} products, ${preview.preview.categories} categories, ${preview.preview.customers} customers, and ${preview.preview.discounts} discount codes will be added to your store.`
                    : 'Loading…'
                  }
                </p>
              </div>
              <button
                onClick={handleInstall}
                disabled={installing || previewLoading}
                style={{ backgroundColor: installing ? undefined : primaryColor }}
                className={`inline-flex items-center justify-center gap-2 px-6 py-3 text-white font-semibold transition-all min-w-[180px] ${
                  installing || previewLoading
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'hover:opacity-90 active:scale-95 cursor-pointer'
                }`}
              >
                {installing ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Installing…
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Install Sample Data
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Info note */}
          <p className="text-xs text-gray-400 text-center">
            Sample data is intended for testing and demo purposes. You can delete individual records from their respective management screens at any time.
          </p>
        </div>
      </div>
    </div>
  );
}
