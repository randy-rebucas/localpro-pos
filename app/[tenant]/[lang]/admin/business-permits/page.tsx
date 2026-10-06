'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { showToast } from '@/lib/toast';
import { getDictionaryClient } from '../../dictionaries-client';
import { usePermissions } from '@/hooks/usePermissions';

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

const INPUT = 'w-full border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900 disabled:bg-gray-100';
const LABEL = 'block text-xs font-medium text-gray-600 mb-1';

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
  const expired = days < 0;
  const text = expired
    ? (dict?.admin?.expiredDaysAgo || 'Expired {days} day(s) ago').replace('{days}', String(Math.abs(days)))
    : (dict?.admin?.expiresInDays || 'Expires in {days} day(s)').replace('{days}', String(days));
  return (
    <p className={`flex items-center gap-1 text-xs mt-1 font-semibold ${expired ? 'text-win8-danger' : 'text-win8-warning'}`}>
      <AlertTriangle className="w-3 h-3" aria-hidden="true" />
      {text}
    </p>
  );
}

function Field({ id, label, value, onChange, placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>{label}</label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${INPUT} font-mono`}
      />
    </div>
  );
}

function DateField({ id, label, value, onChange, dateStr, dict }: { id: string; label: string; value: string; onChange: (v: string) => void; dateStr?: string; dict: any }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    <div>
      <label htmlFor={id} className={LABEL}>{label}</label>
      <input
        id={id}
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        className={INPUT}
      />
      <ExpiryWarning dateStr={dateStr} dict={dict} />
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-300">
      <div className="px-6 py-4 border-b border-gray-300">
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
      </div>
      <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </section>
  );
}

export default function BusinessPermitsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { canAccess } = usePermissions();
  const canManage = canAccess('business_permits.manage');

  const [data, setData] = useState<BusinessPermits>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDictionaryClient(lang as 'en' | 'es').then(setDict);
  }, [lang]);

  const fetchData = useCallback(async () => {
    const failMsg = dict?.admin?.failedToLoadBusinessPermits || 'Failed to load business permits';
    try {
      const res = await fetch(`/api/tenants/${tenant}/business-permits`);
      const json = await res.json();
      if (json.success) {
        setData(json.data ?? {});
        setLoadError(null);
      } else {
        setLoadError(json.error || failMsg);
      }
    } catch { setLoadError(failMsg); }
    finally { setLoading(false); }
  }, [tenant, dict]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const retryLoad = () => {
    setLoading(true);
    setLoadError(null);
    fetchData();
  };

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
      if (json.success) showToast.success(dict?.admin?.businessPermitsSaved || 'Business permits saved');
      else showToast.error(json.error || dict?.admin?.failedToSave || 'Failed to save');
    } catch { showToast.error(dict?.admin?.failedToSave || 'Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <div className="px-4 sm:px-6 py-6">
      <AdminPageHeader
        title={dict?.admin?.businessPermitsTitle || 'Business Permits'}
        description={dict?.admin?.businessPermitsSubtitle || 'LGU permits and government registrations — required for all business types'}
        actions={
          <>
            <Link
              href={`/${tenant}/${lang}/admin/compliance`}
              className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
            >
              {dict?.admin?.complianceStatus || 'Compliance Status'}
            </Link>
            {canManage && (
              <button
                onClick={handleSave}
                disabled={saving || loading || !!loadError}
                className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
              >
                {saving ? (dict?.common?.saving || 'Saving…') : (dict?.admin?.savePermits || 'Save Permits')}
              </button>
            )}
          </>
        }
      />

      <div className="space-y-4">
        {!loading && !loadError && !canManage && (
          <div className="bg-brand-soft border border-brand p-4 text-sm text-brand-navy">
            {dict?.settings?.readOnlyNotice || "You don't have permission to change settings. Contact an admin or manager."}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 bg-white border border-gray-300">
            <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
            <p className="mt-3 text-gray-400 text-sm">{dict?.admin?.loadingBusinessPermits || 'Loading business permits…'}</p>
          </div>
        ) : loadError ? (
          <div className="text-center py-12 bg-white border border-gray-300">
            <p className="text-win8-danger text-sm font-medium">{loadError}</p>
            <button
              onClick={retryLoad}
              className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
            >
              {dict?.common?.retry || 'Retry'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-6 items-start">

            {/* Left — info sidebar */}
            <aside className="w-full lg:w-56 shrink-0 lg:sticky lg:top-6">
              <div className="bg-white border border-gray-300 p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{dict?.admin?.requirements || 'Requirements'}</p>
                <ul className="space-y-2 text-xs text-gray-700">
                  {[
                    dict?.admin?.bpMayorsPermit || "Mayor's Business Permit (RA 7160)",
                    dict?.admin?.bpBarangayClearance || 'Barangay Business Clearance',
                    dict?.admin?.bpDtiSec || 'DTI or SEC Registration',
                    dict?.admin?.bpBirCor || 'BIR Certificate of Registration',
                    dict?.admin?.bpFireSafety || 'Fire Safety Inspection Cert (BFP)',
                    dict?.admin?.bpSanitary || 'Sanitary Permit (LGU Health)',
                  ].map(item => (
                    <li key={item} className="flex gap-2">
                      <span className="inline-block w-1.5 h-1.5 bg-brand shrink-0 mt-1" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
                <hr className="border-gray-200 my-3" />
                <p className="text-xs text-gray-500">{dict?.admin?.bpExpiryNote || 'Permits typically expire annually. Set expiry dates to receive advance warnings.'}</p>
              </div>
            </aside>

            {/* Right — form sections */}
            <fieldset disabled={!canManage} className="w-full flex-1 min-w-0 space-y-6">

              {/* LGU Permits */}
              <SectionCard title={dict?.admin?.lguPermits || 'LGU Permits'}>
                <Field id="bp-mayor" label={dict?.admin?.mayorsPermitNumber || "Mayor's Permit Number"} value={data.mayorsPermitNumber ?? ''} onChange={set('mayorsPermitNumber')} placeholder={dict?.admin?.mayorsPermitNumberPlaceholder || 'e.g. MP-2024-00001'} />
                <DateField id="bp-mayor-expiry" label={dict?.admin?.mayorsPermitExpiry || "Mayor's Permit Expiry"} value={data.mayorsPermitExpiry?.split('T')[0] ?? ''} onChange={set('mayorsPermitExpiry')} dateStr={data.mayorsPermitExpiry} dict={dict} />
                <Field id="bp-barangay" label={dict?.admin?.barangayClearanceNumber || 'Barangay Clearance Number'} value={data.barangayClearanceNumber ?? ''} onChange={set('barangayClearanceNumber')} placeholder={dict?.admin?.barangayClearanceNumberPlaceholder || 'Barangay clearance no.'} />
                <DateField id="bp-barangay-expiry" label={dict?.admin?.barangayClearanceExpiry || 'Barangay Clearance Expiry'} value={data.barangayClearanceExpiry?.split('T')[0] ?? ''} onChange={set('barangayClearanceExpiry')} dateStr={data.barangayClearanceExpiry} dict={dict} />
              </SectionCard>

              {/* Government Registrations */}
              <SectionCard title={dict?.admin?.governmentRegistrations || 'Government Registrations'}>
                <Field id="bp-dti-sec" label={dict?.admin?.dtiSecRegistration || 'DTI / SEC Registration'} value={data.dtiSecRegistration ?? ''} onChange={set('dtiSecRegistration')} placeholder={dict?.admin?.dtiSecRegistrationPlaceholder || 'DTI (sole prop) or SEC (corp)'} />
                <Field id="bp-bir-cor" label={dict?.admin?.birCertificateOfRegistration || 'BIR Certificate of Registration'} value={data.birCertificateOfRegistration ?? ''} onChange={set('birCertificateOfRegistration')} placeholder={dict?.admin?.birCorPlaceholder || 'BIR COR number'} />
              </SectionCard>

              {/* Fire Safety & Sanitation */}
              <SectionCard title={dict?.admin?.fireSafetySanitation || 'Fire Safety & Sanitation'}>
                <Field id="bp-fsic" label={dict?.admin?.fsic || 'Fire Safety Inspection Certificate (FSIC)'} value={data.fireSafetyInspectionCertificate ?? ''} onChange={set('fireSafetyInspectionCertificate')} placeholder={dict?.admin?.fsicPlaceholder || 'FSIC number'} />
                <DateField id="bp-fsic-expiry" label={dict?.admin?.fsicExpiry || 'FSIC Expiry'} value={data.fsicExpiry?.split('T')[0] ?? ''} onChange={set('fsicExpiry')} dateStr={data.fsicExpiry} dict={dict} />
                <Field id="bp-sanitary" label={dict?.admin?.sanitaryPermitNumber || 'Sanitary Permit Number'} value={data.sanitaryPermitNumber ?? ''} onChange={set('sanitaryPermitNumber')} placeholder={dict?.admin?.sanitaryPermitNumberPlaceholder || 'Issued by LGU Health Office'} />
                <DateField id="bp-sanitary-expiry" label={dict?.admin?.sanitaryPermitExpiry || 'Sanitary Permit Expiry'} value={data.sanitaryPermitExpiry?.split('T')[0] ?? ''} onChange={set('sanitaryPermitExpiry')} dateStr={data.sanitaryPermitExpiry} dict={dict} />
              </SectionCard>

            </fieldset>
          </div>
        )}
      </div>
    </div>
  );
}
