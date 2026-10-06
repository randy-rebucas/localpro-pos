'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Lock } from 'lucide-react';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { showToast } from '@/lib/toast';
import { usePermissions } from '@/hooks/usePermissions';
import { getDictionaryClient } from '../../dictionaries-client';

interface PharmacySettings {
  pharmacistName?: string;
  pharmacistPRCNumber?: string;
  pharmacistPTRNumber?: string;
  fdaLTO?: string;
  fdaLTOExpiryDate?: string;
  dohAccreditation?: string;
  pdeaLicense?: string;
  pdeaLicenseExpiry?: string;
  requirePrescriptionForRx?: boolean;
  trackExpiryDates?: boolean;
  expiryAlertDays?: number;
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

function LockOverlay({ dict }: { dict: any }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { tenant, lang } = useParams() as { tenant: string; lang: string };
  return (
    <div className="absolute inset-0 bg-gray-50/90 flex items-center justify-center z-10">
      <div className="text-center px-4">
        <Lock className="w-8 h-8 text-gray-400 mx-auto mb-2" aria-hidden="true" />
        <p className="text-sm text-gray-500 mb-3">{dict?.admin?.requiresProPlan || 'Requires Pro plan or higher'}</p>
        <Link
          href={`/${tenant}/${lang}/admin/subscriptions`}
          className="inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors"
        >
          {dict?.admin?.upgradePlan || 'Upgrade Plan'}
        </Link>
      </div>
    </div>
  );
}

function SectionCard({ title, suffix, description, locked, dict, children }: {
  title: string;
  suffix?: string;
  description?: string;
  locked: boolean;
  dict: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  children: React.ReactNode;
}) {
  return (
    <section className="relative bg-white border border-gray-300">
      {locked && <LockOverlay dict={dict} />}
      <div className="px-6 py-4 border-b border-gray-300">
        <h2 className="text-base font-bold text-gray-900">
          {title}
          {suffix && <span className="ml-1.5 text-sm font-normal text-gray-500">{suffix}</span>}
        </h2>
        {description && <p className="text-sm text-gray-500">{description}</p>}
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

export default function PharmacyCompliancePage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { canAccess } = usePermissions();
  const canManage = canAccess('pharmacy_compliance.manage');

  const [settings, setSettings] = useState<PharmacySettings>({
    requirePrescriptionForRx: true,
    trackExpiryDates: true,
    expiryAlertDays: 90,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hasAccess, setHasAccess] = useState(true);

  useEffect(() => {
    getDictionaryClient(lang as 'en' | 'es').then(setDict);
  }, [lang]);

  const fetchSettings = useCallback(async () => {
    const failMsg = dict?.admin?.failedToLoadPharmacySettings || 'Failed to load pharmacy settings';
    try {
      const res = await fetch(`/api/tenants/${tenant}/pharmacy-settings`);
      const json = await res.json();
      if (json.success) {
        setSettings(prev => ({ ...prev, ...json.data }));
        setLoadError(null);
      } else {
        setLoadError(json.error || failMsg);
      }
    } catch {
      setLoadError(failMsg);
    } finally {
      setLoading(false);
    }
  }, [tenant, dict]);

  const checkAccess = useCallback(async () => {
    try {
      const res = await fetch('/api/subscription/status');
      const json = await res.json();
      setHasAccess(json.data?.pharmacyCompliance?.enablePharmacyCompliance ?? false);
    } catch {
      setHasAccess(false);
    }
  }, []);

  useEffect(() => {
    checkAccess();
    fetchSettings();
  }, [checkAccess, fetchSettings]);

  const retryLoad = () => {
    setLoading(true);
    setLoadError(null);
    fetchSettings();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenant}/pharmacy-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (json.success) {
        showToast.success(dict?.admin?.pharmacySettingsSaved || 'Pharmacy settings saved');
      } else {
        showToast.error(json.error || dict?.admin?.failedToSave || 'Failed to save');
      }
    } catch {
      showToast.error(dict?.admin?.failedToSavePharmacySettings || 'Failed to save pharmacy settings');
    } finally {
      setSaving(false);
    }
  };

  const locked = !hasAccess;

  return (
    <div className="px-4 sm:px-6 py-6">
      <AdminPageHeader
        title={dict?.admin?.pharmacyComplianceTitle || 'Pharmacy Compliance'}
        description={dict?.admin?.pharmacyComplianceSubtitle || 'Philippine FDA, DOH, and PDEA regulatory settings'}
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
                disabled={saving || loading || !!loadError || !hasAccess}
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
            <p className="mt-3 text-gray-400 text-sm">{dict?.admin?.loadingPharmacySettings || 'Loading pharmacy settings…'}</p>
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
            <aside className="w-full lg:w-56 shrink-0 lg:sticky lg:top-6 space-y-4">
              <div className="bg-white border border-gray-300 p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{dict?.admin?.requirements || 'Requirements'}</p>
                <ul className="space-y-2 text-xs text-gray-700">
                  {[
                    dict?.admin?.pharmRequirementFdaLto || 'FDA License to Operate (LTO)',
                    dict?.admin?.pharmRequirementPharmacist || 'Licensed Pharmacist (PRC)',
                    dict?.admin?.pharmRequirementPtr || 'PTR (Professional Tax Receipt)',
                    dict?.admin?.pharmRequirementDoh || 'DOH Accreditation',
                    dict?.admin?.pharmRequirementPdea || 'PDEA License (dangerous drugs only)',
                  ].map(item => (
                    <li key={item} className="flex gap-2">
                      <span className="inline-block w-1.5 h-1.5 bg-brand shrink-0 mt-1" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
                <hr className="border-gray-200 my-3" />
                <p className="text-xs text-gray-500">{dict?.admin?.pharmExpiryNote || 'Set expiry dates to receive advance warnings before licenses lapse.'}</p>
              </div>
              {locked && (
                <div className="bg-white border border-win8-warning p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Lock className="w-4 h-4 text-win8-warning" aria-hidden="true" />
                    <p className="text-xs font-semibold text-win8-warning uppercase tracking-wide">{dict?.admin?.pharmProPlanRequired || 'Pro Plan Required'}</p>
                  </div>
                  <p className="text-xs text-gray-600 mb-3">{dict?.admin?.pharmProPlanUpgradeDesc || 'Upgrade to unlock pharmacy compliance features.'}</p>
                  <Link
                    href={`/${tenant}/${lang}/admin/subscriptions`}
                    className="flex items-center justify-center w-full px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors"
                  >
                    {dict?.admin?.upgradePlan || 'Upgrade Plan'}
                  </Link>
                </div>
              )}
            </aside>

            {/* Right — form sections */}
            <fieldset disabled={!canManage} className="w-full flex-1 min-w-0 space-y-6">

              {/* Pharmacist Info */}
              <SectionCard
                title={dict?.admin?.pharmacistSectionTitle || 'Licensed Pharmacist'}
                locked={locked}
                dict={dict}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="pharm-name" className={LABEL}>{dict?.admin?.pharmacistName || 'Pharmacist Name'}</label>
                    <input
                      id="pharm-name"
                      type="text"
                      value={settings.pharmacistName ?? ''}
                      onChange={e => setSettings(s => ({ ...s, pharmacistName: e.target.value }))}
                      placeholder={dict?.admin?.pharmacistNamePlaceholder || 'Full name'}
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label htmlFor="pharm-prc" className={LABEL}>{dict?.admin?.prcLicenseNumber || 'PRC License Number'}</label>
                    <input
                      id="pharm-prc"
                      type="text"
                      value={settings.pharmacistPRCNumber ?? ''}
                      onChange={e => setSettings(s => ({ ...s, pharmacistPRCNumber: e.target.value }))}
                      placeholder={dict?.admin?.prcNumberPlaceholder || 'e.g. 0123456'}
                      className={`${INPUT} font-mono`}
                    />
                  </div>
                  <div>
                    <label htmlFor="pharm-ptr" className={LABEL}>{dict?.admin?.ptrNumber || 'PTR Number'}</label>
                    <input
                      id="pharm-ptr"
                      type="text"
                      value={settings.pharmacistPTRNumber ?? ''}
                      onChange={e => setSettings(s => ({ ...s, pharmacistPTRNumber: e.target.value }))}
                      placeholder={dict?.admin?.ptrNumberPlaceholder || 'Professional Tax Receipt'}
                      className={`${INPUT} font-mono`}
                    />
                  </div>
                </div>
              </SectionCard>

              {/* FDA License */}
              <SectionCard
                title={dict?.admin?.fdaLtoSectionTitle || 'FDA License to Operate (LTO)'}
                locked={locked}
                dict={dict}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="pharm-lto" className={LABEL}>{dict?.admin?.ltoNumber || 'LTO Number'}</label>
                    <input
                      id="pharm-lto"
                      type="text"
                      value={settings.fdaLTO ?? ''}
                      onChange={e => setSettings(s => ({ ...s, fdaLTO: e.target.value }))}
                      placeholder={dict?.admin?.ltoNumberPlaceholder || 'e.g. LTO-12345678'}
                      className={`${INPUT} font-mono`}
                    />
                  </div>
                  <div>
                    <label htmlFor="pharm-lto-expiry" className={LABEL}>{dict?.admin?.ltoExpiryDate || 'LTO Expiry Date'}</label>
                    <input
                      id="pharm-lto-expiry"
                      type="date"
                      value={settings.fdaLTOExpiryDate?.split('T')[0] ?? ''}
                      onChange={e => setSettings(s => ({ ...s, fdaLTOExpiryDate: e.target.value }))}
                      className={INPUT}
                    />
                    <ExpiryWarning dateStr={settings.fdaLTOExpiryDate} dict={dict} />
                  </div>
                  <div>
                    <label htmlFor="pharm-doh" className={LABEL}>{dict?.admin?.dohAccreditation || 'DOH Accreditation'}</label>
                    <input
                      id="pharm-doh"
                      type="text"
                      value={settings.dohAccreditation ?? ''}
                      onChange={e => setSettings(s => ({ ...s, dohAccreditation: e.target.value }))}
                      placeholder={dict?.admin?.dohAccreditationPlaceholder || 'DOH accreditation number'}
                      className={`${INPUT} font-mono`}
                    />
                  </div>
                </div>
              </SectionCard>

              {/* PDEA */}
              <SectionCard
                title={dict?.admin?.pdeaSectionTitle || 'PDEA License'}
                suffix={dict?.admin?.pdeaSectionSuffix || '(dangerous drugs only)'}
                description={dict?.admin?.pdeaSectionDesc || 'Required only if your pharmacy dispenses dangerous drugs (Schedule 1)'}
                locked={locked}
                dict={dict}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="pharm-pdea" className={LABEL}>{dict?.admin?.pdeaLicenseNumber || 'PDEA License Number'}</label>
                    <input
                      id="pharm-pdea"
                      type="text"
                      value={settings.pdeaLicense ?? ''}
                      onChange={e => setSettings(s => ({ ...s, pdeaLicense: e.target.value }))}
                      placeholder={dict?.admin?.pdeaLicenseNumberPlaceholder || 'e.g. DDA-XXXXXXX'}
                      className={`${INPUT} font-mono`}
                    />
                  </div>
                  <div>
                    <label htmlFor="pharm-pdea-expiry" className={LABEL}>{dict?.admin?.pdeaLicenseExpiry || 'PDEA License Expiry'}</label>
                    <input
                      id="pharm-pdea-expiry"
                      type="date"
                      value={settings.pdeaLicenseExpiry?.split('T')[0] ?? ''}
                      onChange={e => setSettings(s => ({ ...s, pdeaLicenseExpiry: e.target.value }))}
                      className={INPUT}
                    />
                    <ExpiryWarning dateStr={settings.pdeaLicenseExpiry} dict={dict} />
                  </div>
                </div>
              </SectionCard>

              {/* Dispensing Rules */}
              <SectionCard
                title={dict?.admin?.dispensingRulesTitle || 'Dispensing Rules'}
                locked={locked}
                dict={dict}
              >
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.requirePrescriptionForRx ?? true}
                      onChange={e => setSettings(s => ({ ...s, requirePrescriptionForRx: e.target.checked }))}
                      className="checkbox-win8"
                    />
                    {dict?.admin?.requirePrescriptionForRx || 'Require prescription for Rx-only drugs'}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.trackExpiryDates ?? true}
                      onChange={e => setSettings(s => ({ ...s, trackExpiryDates: e.target.checked }))}
                      className="checkbox-win8"
                    />
                    {dict?.admin?.trackExpiryDatesAllProducts || 'Track expiry dates on all products'}
                  </label>
                  <hr className="border-gray-200" />
                  <div>
                    <label htmlFor="pharm-alert-days" className={LABEL}>{dict?.admin?.alertBeforeExpiryDays || 'Alert before expiry (days)'}</label>
                    <input
                      id="pharm-alert-days"
                      type="number"
                      min={7}
                      max={365}
                      value={settings.expiryAlertDays ?? 90}
                      onChange={e => setSettings(s => ({ ...s, expiryAlertDays: Number(e.target.value) }))}
                      className="w-28 border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900 tabular-nums disabled:bg-gray-100"
                    />
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
