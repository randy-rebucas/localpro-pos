'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { UtensilsCrossed, AlertTriangle } from 'lucide-react';

interface RestaurantCompliance {
  fdaFoodBusinessLicense?: string;
  fdaFblExpiry?: string;
  foodSafetyCertificateNumber?: string;
  foodSafetyCertificateExpiry?: string;
  foodHandlersCertified?: boolean;
  numberOfCertifiedHandlers?: number;
  healthCertificateExpiry?: string;
  kitchenSanitationCompliant?: boolean;
}

function ExpiryWarning({ dateStr }: { dateStr?: string }) {
  if (!dateStr) return null;
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
  if (days > 30) return null;
  return (
    <p className="flex items-center gap-1 text-xs mt-1 font-medium text-amber-600">
      <AlertTriangle className="w-3 h-3" />
      {days < 0 ? `Expired ${Math.abs(days)} day(s) ago` : `Expires in ${days} day(s)`}
    </p>
  );
}

export default function RestaurantCompliancePage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;

  const [data, setData] = useState<RestaurantCompliance>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/tenants/${tenant}/restaurant-compliance`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch { toast.error('Failed to load restaurant compliance'); }
    finally { setLoading(false); }
  }, [tenant]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const set = (key: keyof RestaurantCompliance) => (v: unknown) => setData(d => ({ ...d, [key]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenant}/restaurant-compliance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) toast.success('Restaurant compliance settings saved');
      else toast.error(json.error || 'Failed to save');
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <div className="px-4 sm:px-6 py-6">

      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <UtensilsCrossed className="w-7 h-7 text-brand flex-shrink-0" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Restaurant / Food Service Compliance</h1>
            <p className="text-sm text-gray-500 mt-0.5">RA 10611 Food Safety Act — FDA, DOH, and LGU requirements</p>
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
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>FDA Food Business License (RA 10611)</li>
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>Food Safety Certificate</li>
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>Food Handlers Health Certificates</li>
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>Kitchen Sanitation Compliance</li>
              </ul>
              <p className="text-xs text-gray-400 mt-4">Set expiry dates to receive advance warnings before documents lapse.</p>
            </div>
          </aside>

          {/* Right — form sections */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* FDA Food Business License */}
            <div className="bg-white border border-gray-300">
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">FDA Food Business License (FBL)</h2>
                <p className="text-xs text-gray-400 mt-0.5">Required for all food businesses under RA 10611. Apply at the nearest FDA office.</p>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">FBL Number</label>
                  <input type="text" value={data.fdaFoodBusinessLicense ?? ''} onChange={e => set('fdaFoodBusinessLicense')(e.target.value)} placeholder="e.g. FBL-XXXXXXXX"
                    className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">FBL Expiry Date</label>
                  <input type="date" value={data.fdaFblExpiry?.split('T')[0] ?? ''} onChange={e => set('fdaFblExpiry')(e.target.value)}
                    className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand" />
                  <ExpiryWarning dateStr={data.fdaFblExpiry} />
                </div>
              </div>
            </div>

            {/* Food Safety Certificate */}
            <div className="bg-white border border-gray-300">
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Food Safety Certificate</h2>
                <p className="text-xs text-gray-400 mt-0.5">Certificate of compliance with food safety management system requirements.</p>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Certificate Number</label>
                  <input type="text" value={data.foodSafetyCertificateNumber ?? ''} onChange={e => set('foodSafetyCertificateNumber')(e.target.value)}
                    className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Certificate Expiry</label>
                  <input type="date" value={data.foodSafetyCertificateExpiry?.split('T')[0] ?? ''} onChange={e => set('foodSafetyCertificateExpiry')(e.target.value)}
                    className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand" />
                  <ExpiryWarning dateStr={data.foodSafetyCertificateExpiry} />
                </div>
              </div>
            </div>

            {/* Food Handlers */}
            <div className="bg-white border border-gray-300">
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Food Handlers</h2>
                <p className="text-xs text-gray-400 mt-0.5">All food handlers must hold valid health certificates from the LGU Health Office.</p>
              </div>
              <div className="p-5 space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={data.foodHandlersCertified ?? false} onChange={e => set('foodHandlersCertified')(e.target.checked)} className="w-4 h-4 accent-brand" />
                  <span className="text-sm text-gray-700">All food handlers have valid health certificates</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={data.kitchenSanitationCompliant ?? false} onChange={e => set('kitchenSanitationCompliant')(e.target.checked)} className="w-4 h-4 accent-brand" />
                  <span className="text-sm text-gray-700">Kitchen sanitation standards are met (RA 10611)</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Number of Certified Food Handlers</label>
                    <input type="number" min={0} value={data.numberOfCertifiedHandlers ?? ''} onChange={e => set('numberOfCertifiedHandlers')(Number(e.target.value))}
                      className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Earliest Health Certificate Expiry</label>
                    <input type="date" value={data.healthCertificateExpiry?.split('T')[0] ?? ''} onChange={e => set('healthCertificateExpiry')(e.target.value)}
                      className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand" />
                    <ExpiryWarning dateStr={data.healthCertificateExpiry} />
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
