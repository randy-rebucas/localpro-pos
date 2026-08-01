'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Building2, AlertTriangle } from 'lucide-react';
import { getDictionaryClient } from '../../dictionaries-client';

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

/**
 * Whole calendar days between today and the given date, comparing local
 * midnight-to-midnight rather than raw instants — a live Date.now() against
 * a stored midnight timestamp (via Math.ceil on the raw ms diff) would flip
 * the result by a day depending on what time of day it currently is.
 */
function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const targetMidnight = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  return Math.round((targetMidnight.getTime() - todayMidnight.getTime()) / 86400000);
}

function ExpiryWarning({ dateStr, dict }: { dateStr?: string; dict: any }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!dateStr) return null;
  const days = daysUntil(dateStr);
  if (days > 30) return null;
  const text = days < 0
    ? (dict?.admin?.expiredDaysAgo || 'Expired {days} day(s) ago').replace('{days}', String(Math.abs(days)))
    : (dict?.admin?.expiresInDays || 'Expires in {days} day(s)').replace('{days}', String(days));
  return (
    <p className="flex items-center gap-1 text-xs mt-1 font-medium text-amber-600">
      <AlertTriangle className="w-3 h-3" />
      {text}
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

function DateField({ label, value, onChange, dateStr, dict }: { label: string; value: string; onChange: (v: string) => void; dateStr?: string; dict: any }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
      />
      <ExpiryWarning dateStr={dateStr} dict={dict} />
    </div>
  );
}

export default function BusinessPermitsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  const [data, setData] = useState<BusinessPermits>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDictionaryClient(lang as 'en' | 'es').then(setDict);
  }, [lang]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/tenants/${tenant}/business-permits`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch { toast.error(dict?.admin?.failedToLoadBusinessPermits || 'Failed to load business permits'); }
    finally { setLoading(false); }
  }, [tenant, dict]);

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
      if (json.success) toast.success(dict?.admin?.businessPermitsSaved || 'Business permits saved');
      else toast.error(json.error || dict?.admin?.failedToSave || 'Failed to save');
    } catch { toast.error(dict?.admin?.failedToSave || 'Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <div className="px-4 sm:px-6 py-6">

      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <Building2 className="w-7 h-7 text-brand flex-shrink-0" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{dict?.admin?.businessPermitsTitle || 'Business Permits'}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{dict?.admin?.businessPermitsSubtitle || 'LGU permits and government registrations — required for all business types'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href={`/${tenant}/${lang}/admin/compliance`}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
          >
            {dict?.admin?.complianceStatus || 'Compliance Status'}
          </Link>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-4 py-2 text-sm font-medium bg-brand text-white border border-brand-hover hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            {saving ? (dict?.admin?.saving || 'Saving...') : (dict?.admin?.savePermits || 'Save Permits')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="inline-block animate-spin h-7 w-7 border-b-2 border-brand mb-3" />
            <p className="text-sm text-gray-400">{dict?.common?.loading || 'Loading...'}</p>
          </div>
        </div>
      ) : (
        <div className="flex gap-6 items-start">

          {/* Left — info sidebar */}
          <aside className="w-52 shrink-0 sticky top-6">
            <div className="bg-white border border-gray-300 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{dict?.admin?.requirements || 'Requirements'}</p>
              <ul className="space-y-2 text-xs text-gray-600">
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>{dict?.admin?.bpMayorsPermit || "Mayor's Business Permit (RA 7160)"}</li>
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>{dict?.admin?.bpBarangayClearance || 'Barangay Business Clearance'}</li>
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>{dict?.admin?.bpDtiSec || 'DTI or SEC Registration'}</li>
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>{dict?.admin?.bpBirCor || 'BIR Certificate of Registration'}</li>
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>{dict?.admin?.bpFireSafety || 'Fire Safety Inspection Cert (BFP)'}</li>
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>{dict?.admin?.bpSanitary || 'Sanitary Permit (LGU Health)'}</li>
              </ul>
              <p className="text-xs text-gray-400 mt-4">{dict?.admin?.bpExpiryNote || 'Permits typically expire annually. Set expiry dates to receive advance warnings.'}</p>
            </div>
          </aside>

          {/* Right — form sections */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* LGU Permits */}
            <div className="bg-white border border-gray-300">
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{dict?.admin?.lguPermits || 'LGU Permits'}</h2>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label={dict?.admin?.mayorsPermitNumber || "Mayor's Permit Number"} value={data.mayorsPermitNumber ?? ''} onChange={set('mayorsPermitNumber')} placeholder={dict?.admin?.mayorsPermitNumberPlaceholder || 'e.g. MP-2024-00001'} />
                <DateField label={dict?.admin?.mayorsPermitExpiry || "Mayor's Permit Expiry"} value={data.mayorsPermitExpiry?.split('T')[0] ?? ''} onChange={set('mayorsPermitExpiry')} dateStr={data.mayorsPermitExpiry} dict={dict} />
                <Field label={dict?.admin?.barangayClearanceNumber || 'Barangay Clearance Number'} value={data.barangayClearanceNumber ?? ''} onChange={set('barangayClearanceNumber')} placeholder={dict?.admin?.barangayClearanceNumberPlaceholder || 'Barangay clearance no.'} />
                <DateField label={dict?.admin?.barangayClearanceExpiry || 'Barangay Clearance Expiry'} value={data.barangayClearanceExpiry?.split('T')[0] ?? ''} onChange={set('barangayClearanceExpiry')} dateStr={data.barangayClearanceExpiry} dict={dict} />
              </div>
            </div>

            {/* Government Registrations */}
            <div className="bg-white border border-gray-300">
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{dict?.admin?.governmentRegistrations || 'Government Registrations'}</h2>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label={dict?.admin?.dtiSecRegistration || 'DTI / SEC Registration'} value={data.dtiSecRegistration ?? ''} onChange={set('dtiSecRegistration')} placeholder={dict?.admin?.dtiSecRegistrationPlaceholder || 'DTI (sole prop) or SEC (corp)'} />
                <Field label={dict?.admin?.birCertificateOfRegistration || 'BIR Certificate of Registration'} value={data.birCertificateOfRegistration ?? ''} onChange={set('birCertificateOfRegistration')} placeholder={dict?.admin?.birCorPlaceholder || 'BIR COR number'} />
              </div>
            </div>

            {/* Fire Safety & Sanitation */}
            <div className="bg-white border border-gray-300">
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{dict?.admin?.fireSafetySanitation || 'Fire Safety & Sanitation'}</h2>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label={dict?.admin?.fsic || 'Fire Safety Inspection Certificate (FSIC)'} value={data.fireSafetyInspectionCertificate ?? ''} onChange={set('fireSafetyInspectionCertificate')} placeholder={dict?.admin?.fsicPlaceholder || 'FSIC number'} />
                <DateField label={dict?.admin?.fsicExpiry || 'FSIC Expiry'} value={data.fsicExpiry?.split('T')[0] ?? ''} onChange={set('fsicExpiry')} dateStr={data.fsicExpiry} dict={dict} />
                <Field label={dict?.admin?.sanitaryPermitNumber || 'Sanitary Permit Number'} value={data.sanitaryPermitNumber ?? ''} onChange={set('sanitaryPermitNumber')} placeholder={dict?.admin?.sanitaryPermitNumberPlaceholder || 'Issued by LGU Health Office'} />
                <DateField label={dict?.admin?.sanitaryPermitExpiry || 'Sanitary Permit Expiry'} value={data.sanitaryPermitExpiry?.split('T')[0] ?? ''} onChange={set('sanitaryPermitExpiry')} dateStr={data.sanitaryPermitExpiry} dict={dict} />
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
