'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { showToast } from '@/lib/toast';
import { getDictionaryClient } from '../../dictionaries-client';
import { usePermissions } from '@/hooks/usePermissions';

interface LaundryCompliance {
  environmentalComplianceCertificate?: string;
  eccExpiry?: string;
  wastewaterDischargePermit?: string;
  wastewaterPermitExpiry?: string;
  solidWasteManagementPlan?: boolean;
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

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-300">
      <div className="px-6 py-4 border-b border-gray-300">
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        {description && <p className="text-sm text-gray-500">{description}</p>}
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

export default function LaundryCompliancePage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;
  const { canAccess } = usePermissions();
  const canManage = canAccess('laundry_compliance.manage');
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  const [data, setData] = useState<LaundryCompliance>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDictionaryClient(lang as 'en' | 'es').then(setDict);
  }, [lang]);

  const fetchData = useCallback(async () => {
    const failMsg = dict?.admin?.failedToLoadLaundryCompliance || 'Failed to load laundry compliance';
    try {
      const res = await fetch(`/api/tenants/${tenant}/laundry-compliance`);
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
      if (json.success) showToast.success(dict?.admin?.laundryComplianceSaved || 'Laundry compliance settings saved');
      else showToast.error(json.error || dict?.admin?.failedToSave || 'Failed to save');
    } catch { showToast.error(dict?.admin?.failedToSave || 'Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <div className="px-4 sm:px-6 py-6">
      <AdminPageHeader
        title={dict?.admin?.laundryComplianceTitle || 'Laundry Service Compliance'}
        description={dict?.admin?.laundryComplianceSubtitle || 'DENR/EMB environmental requirements for laundry and dry cleaning businesses'}
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
                {saving ? (dict?.common?.saving || 'Saving…') : (dict?.admin?.saveSettings || 'Save Settings')}
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
            <p className="mt-3 text-gray-400 text-sm">{dict?.admin?.loadingLaundryCompliance || 'Loading laundry compliance…'}</p>
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
                    dict?.admin?.lcEcc || 'Environmental Compliance Certificate (DENR-EMB)',
                    dict?.admin?.lcWastewater || 'Wastewater Discharge Permit (DENR-EMB)',
                    dict?.admin?.lcSolidWaste || 'Solid Waste Management Plan (RA 9003)',
                  ].map(item => (
                    <li key={item} className="flex gap-2">
                      <span className="inline-block w-1.5 h-1.5 bg-brand shrink-0 mt-1" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
                <hr className="border-gray-200 my-3" />
                <p className="text-xs text-gray-500">{dict?.admin?.lcExpiryNote || 'Set expiry dates to receive advance warnings before documents lapse.'}</p>
              </div>
            </aside>

            {/* Right — form sections */}
            <fieldset disabled={!canManage} className="w-full flex-1 min-w-0 space-y-6">

              {/* ECC */}
              <SectionCard
                title={dict?.admin?.eccSectionTitle || 'Environmental Compliance Certificate (ECC)'}
                description={dict?.admin?.eccSectionDesc || 'Required for laundry businesses that discharge wastewater, issued by DENR-EMB.'}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="lc-ecc" className={LABEL}>{dict?.admin?.eccNumber || 'ECC Number'}</label>
                    <input id="lc-ecc" type="text" value={data.environmentalComplianceCertificate ?? ''} onChange={e => set('environmentalComplianceCertificate')(e.target.value)} placeholder={dict?.admin?.eccNumberPlaceholder || 'e.g. ECC-XXXXXXXX'}
                      className={`${INPUT} font-mono`} />
                  </div>
                  <div>
                    <label htmlFor="lc-ecc-expiry" className={LABEL}>{dict?.admin?.eccExpiryDate || 'ECC Expiry Date'}</label>
                    <input id="lc-ecc-expiry" type="date" value={data.eccExpiry?.split('T')[0] ?? ''} onChange={e => set('eccExpiry')(e.target.value)}
                      className={INPUT} />
                    <ExpiryWarning dateStr={data.eccExpiry} dict={dict} />
                  </div>
                </div>
              </SectionCard>

              {/* Wastewater Discharge Permit */}
              <SectionCard
                title={dict?.admin?.wastewaterPermitTitle || 'Wastewater Discharge Permit'}
                description={dict?.admin?.wastewaterPermitDesc || 'Discharge Permit issued by DENR-EMB for businesses that release effluents to bodies of water or sewerage systems.'}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="lc-discharge" className={LABEL}>{dict?.admin?.dischargePermitNumber || 'Discharge Permit Number'}</label>
                    <input id="lc-discharge" type="text" value={data.wastewaterDischargePermit ?? ''} onChange={e => set('wastewaterDischargePermit')(e.target.value)} placeholder={dict?.admin?.dischargePermitNumberPlaceholder || 'Discharge permit number'}
                      className={`${INPUT} font-mono`} />
                  </div>
                  <div>
                    <label htmlFor="lc-discharge-expiry" className={LABEL}>{dict?.admin?.permitExpiryDate || 'Permit Expiry Date'}</label>
                    <input id="lc-discharge-expiry" type="date" value={data.wastewaterPermitExpiry?.split('T')[0] ?? ''} onChange={e => set('wastewaterPermitExpiry')(e.target.value)}
                      className={INPUT} />
                    <ExpiryWarning dateStr={data.wastewaterPermitExpiry} dict={dict} />
                  </div>
                </div>
              </SectionCard>

              {/* Solid Waste */}
              <SectionCard title={dict?.admin?.solidWasteManagement || 'Solid Waste Management'}>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={data.solidWasteManagementPlan ?? false}
                    onChange={e => set('solidWasteManagementPlan')(e.target.checked)}
                    className="checkbox-win8 mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-700">{dict?.admin?.solidWastePlanInPlace || 'Solid Waste Management Plan in place (RA 9003)'}</span>
                    <span className="block text-xs text-gray-500 mt-0.5">{dict?.admin?.solidWastePlanDesc || 'Business has a solid waste management program aligned with the Ecological Solid Waste Management Act'}</span>
                  </span>
                </label>
              </SectionCard>

            </fieldset>
          </div>
        )}
      </div>
    </div>
  );
}
