'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ShoppingBag } from 'lucide-react';

interface RetailCompliance {
  dtiBusinessNameRegistration?: string;
  priceTaggingCompliant?: boolean;
  weightsAndMeasuresCompliant?: boolean;
  btiAccreditation?: string;
  productLabelsCompliant?: boolean;
}

export default function RetailCompliancePage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;

  const [data, setData] = useState<RetailCompliance>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/tenants/${tenant}/retail-compliance`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch { toast.error('Failed to load retail compliance'); }
    finally { setLoading(false); }
  }, [tenant]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const set = (key: keyof RetailCompliance) => (v: unknown) => setData(d => ({ ...d, [key]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenant}/retail-compliance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) toast.success('Retail compliance settings saved');
      else toast.error(json.error || 'Failed to save');
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <div className="px-4 sm:px-6 py-6">

      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <ShoppingBag className="w-7 h-7 text-brand flex-shrink-0" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Retail Store Compliance</h1>
            <p className="text-sm text-gray-500 mt-0.5">RA 7394 Consumer Act of the Philippines — DTI and consumer protection</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href={`/${tenant}/${lang}/admin/compliance`}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
          >
            Compliance Status
          </Link>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-4 py-2 text-sm font-medium bg-brand text-white border border-brand-hover hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="inline-block animate-spin h-7 w-7 border-b-2 border-brand mb-3" />
            <p className="text-sm text-gray-400">Loading...</p>
          </div>
        </div>
      ) : (
        <div className="flex gap-6 items-start">

          {/* Left — info sidebar */}
          <aside className="w-52 shrink-0 sticky top-6">
            <div className="bg-white border border-gray-300 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Requirements</p>
              <ul className="space-y-2 text-xs text-gray-600">
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>DTI Business Name Registration (RA 3883)</li>
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>Price Tagging Compliance (DTI)</li>
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>Weights &amp; Measures (DOST-MSSM)</li>
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>Product Labels (RA 7394)</li>
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>BTI Accreditation (importers/exporters)</li>
              </ul>
              <p className="text-xs text-gray-400 mt-4">Ensure all consumer protection requirements are met before operating your retail store.</p>
            </div>
          </aside>

          {/* Right — form sections */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* DTI Registration */}
            <div className="bg-white border border-gray-300">
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">DTI Business Name Registration</h2>
                <p className="text-xs text-gray-400 mt-0.5">Required for sole proprietors under RA 3883. Corporations register with SEC instead.</p>
              </div>
              <div className="p-5">
                <label className="block text-xs font-medium text-gray-600 mb-1">Registration Number</label>
                <input
                  type="text"
                  value={data.dtiBusinessNameRegistration ?? ''}
                  onChange={e => set('dtiBusinessNameRegistration')(e.target.value)}
                  placeholder="e.g. BN202400000001"
                  className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                />
              </div>
            </div>

            {/* Consumer Act Compliance */}
            <div className="bg-white border border-gray-300">
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Consumer Act Compliance (RA 7394)</h2>
                <p className="text-xs text-gray-400 mt-0.5">Requirements for retail stores selling directly to consumers.</p>
              </div>
              <div className="p-5 space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={data.priceTaggingCompliant ?? false}
                    onChange={e => set('priceTaggingCompliant')(e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-brand"
                  />
                  <div>
                    <span className="text-sm text-gray-700 font-medium">Price Tagging Compliant</span>
                    <p className="text-xs text-gray-400 mt-0.5">All products have visible price tags or shelf prices per DTI price tag law</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={data.weightsAndMeasuresCompliant ?? false}
                    onChange={e => set('weightsAndMeasuresCompliant')(e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-brand"
                  />
                  <div>
                    <span className="text-sm text-gray-700 font-medium">Weights &amp; Measures Compliant</span>
                    <p className="text-xs text-gray-400 mt-0.5">Weighing and measuring devices are calibrated and stamped by DOST-MSSM</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={data.productLabelsCompliant ?? false}
                    onChange={e => set('productLabelsCompliant')(e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-brand"
                  />
                  <div>
                    <span className="text-sm text-gray-700 font-medium">Product Labels Compliant</span>
                    <p className="text-xs text-gray-400 mt-0.5">All product labels include mandatory information (contents, manufacturer, country of origin)</p>
                  </div>
                </label>
              </div>
            </div>

            {/* BTI Accreditation */}
            <div className="bg-white border border-gray-300">
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">BTI Accreditation <span className="normal-case font-normal text-gray-400">(Optional)</span></h2>
                <p className="text-xs text-gray-400 mt-0.5">Bureau of Trade and Industry accreditation for importers or exporters.</p>
              </div>
              <div className="p-5">
                <label className="block text-xs font-medium text-gray-600 mb-1">Accreditation Number</label>
                <input
                  type="text"
                  value={data.btiAccreditation ?? ''}
                  onChange={e => set('btiAccreditation')(e.target.value)}
                  placeholder="BTI accreditation number (if applicable)"
                  className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                />
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
