'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { showToast } from '@/lib/toast';
import { getDictionaryClient } from '../../dictionaries-client';
import { usePermissions } from '@/hooks/usePermissions';

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

export default function RestaurantCompliancePage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { canAccess } = usePermissions();
  const canManage = canAccess('restaurant_compliance.manage');

  const [data, setData] = useState<RestaurantCompliance>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDictionaryClient(lang as 'en' | 'es').then(setDict);
  }, [lang]);

  const fetchData = useCallback(async () => {
    const failMsg = dict?.admin?.failedToLoadRestaurantCompliance || 'Failed to load restaurant compliance';
    try {
      const res = await fetch(`/api/tenants/${tenant}/restaurant-compliance`);
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
      if (json.success) showToast.success(dict?.admin?.restaurantComplianceSaved || 'Restaurant compliance settings saved');
      else showToast.error(json.error || dict?.admin?.failedToSave || 'Failed to save');
    } catch { showToast.error(dict?.admin?.failedToSave || 'Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <div className="px-4 sm:px-6 py-6">
      <AdminPageHeader
        title={dict?.admin?.restaurantComplianceTitle || 'Restaurant / Food Service Compliance'}
        description={dict?.admin?.restaurantComplianceSubtitle || 'RA 10611 Food Safety Act — FDA, DOH, and LGU requirements'}
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
            {dict?.admin?.rcReadOnlyNotice || "You don't have permission to change restaurant compliance settings. Contact an admin or manager."}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 bg-white border border-gray-300">
            <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
            <p className="mt-3 text-gray-400 text-sm">{dict?.admin?.loadingRestaurantCompliance || 'Loading restaurant compliance…'}</p>
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
                    dict?.admin?.rcFdaLicense || 'FDA Food Business License (RA 10611)',
                    dict?.admin?.rcFoodSafetyCert || 'Food Safety Certificate',
                    dict?.admin?.rcFoodHandlersCert || 'Food Handlers Health Certificates',
                    dict?.admin?.rcKitchenSanitation || 'Kitchen Sanitation Compliance',
                  ].map(item => (
                    <li key={item} className="flex gap-2">
                      <span className="inline-block w-1.5 h-1.5 bg-brand shrink-0 mt-1" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
                <hr className="border-gray-200 my-3" />
                <p className="text-xs text-gray-500">{dict?.admin?.rcExpiryNote || 'Set expiry dates to receive advance warnings before documents lapse.'}</p>
              </div>
            </aside>

            {/* Right — form sections */}
            <fieldset disabled={!canManage} className="w-full flex-1 min-w-0 space-y-6">

              {/* FDA Food Business License */}
              <SectionCard
                title={dict?.admin?.fdaFblTitle || 'FDA Food Business License (FBL)'}
                description={dict?.admin?.fdaFblDesc || 'Required for all food businesses under RA 10611. Apply at the nearest FDA office.'}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="rc-fbl" className={LABEL}>{dict?.admin?.fblNumber || 'FBL Number'}</label>
                    <input id="rc-fbl" type="text" value={data.fdaFoodBusinessLicense ?? ''} onChange={e => set('fdaFoodBusinessLicense')(e.target.value)} placeholder={dict?.admin?.fblNumberPlaceholder || 'e.g. FBL-XXXXXXXX'}
                      className={`${INPUT} font-mono`} />
                  </div>
                  <div>
                    <label htmlFor="rc-fbl-expiry" className={LABEL}>{dict?.admin?.fblExpiryDate || 'FBL Expiry Date'}</label>
                    <input id="rc-fbl-expiry" type="date" value={data.fdaFblExpiry?.split('T')[0] ?? ''} onChange={e => set('fdaFblExpiry')(e.target.value)}
                      className={INPUT} />
                    <ExpiryWarning dateStr={data.fdaFblExpiry} dict={dict} />
                  </div>
                </div>
              </SectionCard>

              {/* Food Safety Certificate */}
              <SectionCard
                title={dict?.admin?.foodSafetyCertTitle || 'Food Safety Certificate'}
                description={dict?.admin?.foodSafetyCertDesc || 'Certificate of compliance with food safety management system requirements.'}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="rc-fsc" className={LABEL}>{dict?.admin?.certificateNumber || 'Certificate Number'}</label>
                    <input id="rc-fsc" type="text" value={data.foodSafetyCertificateNumber ?? ''} onChange={e => set('foodSafetyCertificateNumber')(e.target.value)}
                      className={`${INPUT} font-mono`} />
                  </div>
                  <div>
                    <label htmlFor="rc-fsc-expiry" className={LABEL}>{dict?.admin?.certificateExpiry || 'Certificate Expiry'}</label>
                    <input id="rc-fsc-expiry" type="date" value={data.foodSafetyCertificateExpiry?.split('T')[0] ?? ''} onChange={e => set('foodSafetyCertificateExpiry')(e.target.value)}
                      className={INPUT} />
                    <ExpiryWarning dateStr={data.foodSafetyCertificateExpiry} dict={dict} />
                  </div>
                </div>
              </SectionCard>

              {/* Food Handlers */}
              <SectionCard
                title={dict?.admin?.foodHandlersTitle || 'Food Handlers'}
                description={dict?.admin?.foodHandlersDesc || 'All food handlers must hold valid health certificates from the LGU Health Office.'}
              >
                <div className="space-y-4">
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={data.foodHandlersCertified ?? false} onChange={e => set('foodHandlersCertified')(e.target.checked)} className="checkbox-win8" />
                      {dict?.admin?.allFoodHandlersCertified || 'All food handlers have valid health certificates'}
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={data.kitchenSanitationCompliant ?? false} onChange={e => set('kitchenSanitationCompliant')(e.target.checked)} className="checkbox-win8" />
                      {dict?.admin?.kitchenSanitationMet || 'Kitchen sanitation standards are met (RA 10611)'}
                    </label>
                  </div>
                  <hr className="border-gray-200" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="rc-handlers" className={LABEL}>{dict?.admin?.numberOfCertifiedHandlers || 'Number of Certified Food Handlers'}</label>
                      <input id="rc-handlers" type="number" min={0} value={data.numberOfCertifiedHandlers ?? ''}
                        onChange={e => set('numberOfCertifiedHandlers')(Number(e.target.value))}
                        className={`${INPUT} tabular-nums`} />
                    </div>
                    <div>
                      <label htmlFor="rc-health-expiry" className={LABEL}>{dict?.admin?.earliestHealthCertExpiry || 'Earliest Health Certificate Expiry'}</label>
                      <input id="rc-health-expiry" type="date" value={data.healthCertificateExpiry?.split('T')[0] ?? ''} onChange={e => set('healthCertificateExpiry')(e.target.value)}
                        className={INPUT} />
                      <ExpiryWarning dateStr={data.healthCertificateExpiry} dict={dict} />
                    </div>
                  </div>
                </div>
              </SectionCard>

            </fieldset>
          </div>
        )}
      </div>
    </div>
  );
}
