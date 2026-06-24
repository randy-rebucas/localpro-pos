'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { WashingMachine, AlertTriangle } from 'lucide-react';

interface LaundryCompliance {
  environmentalComplianceCertificate?: string;
  eccExpiry?: string;
  wastewaterDischargePermit?: string;
  wastewaterPermitExpiry?: string;
  solidWasteManagementPlan?: boolean;
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

export default function LaundryCompliancePage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;

  const [data, setData] = useState<LaundryCompliance>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/tenants/${tenant}/laundry-compliance`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch { toast.error('Failed to load laundry compliance'); }
    finally { setLoading(false); }
  }, [tenant]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const set = (key: keyof LaundryCompliance) => (v: unknown) => setData(d => ({ ...d, [key]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenant}/laundry-compliance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) toast.success('Laundry compliance settings saved');
      else toast.error(json.error || 'Failed to save');
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <div className="px-4 sm:px-6 py-6">

      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <WashingMachine className="w-7 h-7 text-brand flex-shrink-0" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Laundry Service Compliance</h1>
            <p className="text-sm text-gray-500 mt-0.5">DENR/EMB environmental requirements for laundry and dry cleaning businesses</p>
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
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>Environmental Compliance Certificate (DENR-EMB)</li>
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>Wastewater Discharge Permit (DENR-EMB)</li>
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>Solid Waste Management Plan (RA 9003)</li>
              </ul>
              <p className="text-xs text-gray-400 mt-4">Set expiry dates to receive advance warnings before documents lapse.</p>
            </div>
          </aside>

          {/* Right — form sections */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* ECC */}
            <div className="bg-white border border-gray-300">
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Environmental Compliance Certificate (ECC)</h2>
                <p className="text-xs text-gray-400 mt-0.5">Required for laundry businesses that discharge wastewater, issued by DENR-EMB.</p>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">ECC Number</label>
                  <input type="text" value={data.environmentalComplianceCertificate ?? ''} onChange={e => set('environmentalComplianceCertificate')(e.target.value)} placeholder="e.g. ECC-XXXXXXXX"
                    className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">ECC Expiry Date</label>
                  <input type="date" value={data.eccExpiry?.split('T')[0] ?? ''} onChange={e => set('eccExpiry')(e.target.value)}
                    className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand" />
                  <ExpiryWarning dateStr={data.eccExpiry} />
                </div>
              </div>
            </div>

            {/* Wastewater Discharge Permit */}
            <div className="bg-white border border-gray-300">
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Wastewater Discharge Permit</h2>
                <p className="text-xs text-gray-400 mt-0.5">Discharge Permit issued by DENR-EMB for businesses that release effluents to bodies of water or sewerage systems.</p>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Discharge Permit Number</label>
                  <input type="text" value={data.wastewaterDischargePermit ?? ''} onChange={e => set('wastewaterDischargePermit')(e.target.value)} placeholder="Discharge permit number"
                    className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Permit Expiry Date</label>
                  <input type="date" value={data.wastewaterPermitExpiry?.split('T')[0] ?? ''} onChange={e => set('wastewaterPermitExpiry')(e.target.value)}
                    className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand" />
                  <ExpiryWarning dateStr={data.wastewaterPermitExpiry} />
                </div>
              </div>
            </div>

            {/* Solid Waste */}
            <div className="bg-white border border-gray-300">
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Solid Waste Management</h2>
              </div>
              <div className="p-5">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={data.solidWasteManagementPlan ?? false}
                    onChange={e => set('solidWasteManagementPlan')(e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-brand"
                  />
                  <div>
                    <span className="text-sm text-gray-700 font-medium">Solid Waste Management Plan in place (RA 9003)</span>
                    <p className="text-xs text-gray-400 mt-0.5">Business has a solid waste management program aligned with the Ecological Solid Waste Management Act</p>
                  </div>
                </label>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
