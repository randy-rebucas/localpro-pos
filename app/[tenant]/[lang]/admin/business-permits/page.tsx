'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Building2, AlertTriangle } from 'lucide-react';

interface BusinessPermits {
  mayorsPermitNumber?: string;
  mayorsPermitExpiry?: string;
  barangayClearanceNumber?: string;
  barangayClearanceExpiry?: string;
  dtiSecRegistration?: string;
  birCertificateOfRegistration?: string;
  fireSafetyInspectionCertificate?: string;
  fsicExpiry?: string;
  sanitaryPermitNumber?: string;
  sanitaryPermitExpiry?: string;
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

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
      />
    </div>
  );
}

function DateField({ label, value, onChange, dateStr }: { label: string; value: string; onChange: (v: string) => void; dateStr?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
      />
      <ExpiryWarning dateStr={dateStr} />
    </div>
  );
}

export default function BusinessPermitsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;

  const [data, setData] = useState<BusinessPermits>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/tenants/${tenant}/business-permits`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch { toast.error('Failed to load business permits'); }
    finally { setLoading(false); }
  }, [tenant]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const set = (key: keyof BusinessPermits) => (v: string) => setData(d => ({ ...d, [key]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenant}/business-permits`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) toast.success('Business permits saved');
      else toast.error(json.error || 'Failed to save');
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <div className="px-4 sm:px-6 py-6">

      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <Building2 className="w-7 h-7 text-brand flex-shrink-0" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Business Permits</h1>
            <p className="text-sm text-gray-500 mt-0.5">LGU permits and government registrations — required for all business types</p>
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
            {saving ? 'Saving...' : 'Save Permits'}
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
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>Mayor's Business Permit (RA 7160)</li>
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>Barangay Business Clearance</li>
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>DTI or SEC Registration</li>
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>BIR Certificate of Registration</li>
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>Fire Safety Inspection Cert (BFP)</li>
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>Sanitary Permit (LGU Health)</li>
              </ul>
              <p className="text-xs text-gray-400 mt-4">Permits typically expire annually. Set expiry dates to receive advance warnings.</p>
            </div>
          </aside>

          {/* Right — form sections */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* LGU Permits */}
            <div className="bg-white border border-gray-300">
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">LGU Permits</h2>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Mayor's Permit Number" value={data.mayorsPermitNumber ?? ''} onChange={set('mayorsPermitNumber')} placeholder="e.g. MP-2024-00001" />
                <DateField label="Mayor's Permit Expiry" value={data.mayorsPermitExpiry?.split('T')[0] ?? ''} onChange={set('mayorsPermitExpiry')} dateStr={data.mayorsPermitExpiry} />
                <Field label="Barangay Clearance Number" value={data.barangayClearanceNumber ?? ''} onChange={set('barangayClearanceNumber')} placeholder="Barangay clearance no." />
                <DateField label="Barangay Clearance Expiry" value={data.barangayClearanceExpiry?.split('T')[0] ?? ''} onChange={set('barangayClearanceExpiry')} dateStr={data.barangayClearanceExpiry} />
              </div>
            </div>

            {/* Government Registrations */}
            <div className="bg-white border border-gray-300">
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Government Registrations</h2>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="DTI / SEC Registration" value={data.dtiSecRegistration ?? ''} onChange={set('dtiSecRegistration')} placeholder="DTI (sole prop) or SEC (corp)" />
                <Field label="BIR Certificate of Registration" value={data.birCertificateOfRegistration ?? ''} onChange={set('birCertificateOfRegistration')} placeholder="BIR COR number" />
              </div>
            </div>

            {/* Fire Safety & Sanitation */}
            <div className="bg-white border border-gray-300">
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Fire Safety &amp; Sanitation</h2>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Fire Safety Inspection Certificate (FSIC)" value={data.fireSafetyInspectionCertificate ?? ''} onChange={set('fireSafetyInspectionCertificate')} placeholder="FSIC number" />
                <DateField label="FSIC Expiry" value={data.fsicExpiry?.split('T')[0] ?? ''} onChange={set('fsicExpiry')} dateStr={data.fsicExpiry} />
                <Field label="Sanitary Permit Number" value={data.sanitaryPermitNumber ?? ''} onChange={set('sanitaryPermitNumber')} placeholder="Issued by LGU Health Office" />
                <DateField label="Sanitary Permit Expiry" value={data.sanitaryPermitExpiry?.split('T')[0] ?? ''} onChange={set('sanitaryPermitExpiry')} dateStr={data.sanitaryPermitExpiry} />
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
