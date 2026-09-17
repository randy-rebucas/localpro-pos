'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ShieldCheck, AlertTriangle, Lock } from 'lucide-react';
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

function LockOverlay({ dict }: { dict: any }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { tenant, lang } = useParams() as { tenant: string; lang: string };
  return (
    <div className="absolute inset-0 bg-gray-50 bg-opacity-90 flex items-center justify-center z-10">
      <div className="text-center px-4">
        <Lock className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-sm text-gray-500 mb-2">{dict?.admin?.requiresProPlan || 'Requires Pro plan or higher'}</p>
        <Link href={`/${tenant}/${lang}/admin/subscriptions`} className="text-brand hover:text-brand-hover text-sm font-medium">
          {dict?.admin?.upgradePlan || 'Upgrade Plan'}
        </Link>
      </div>
    </div>
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
  const [saving, setSaving] = useState(false);
  const [hasAccess, setHasAccess] = useState(true);

  useEffect(() => {
    getDictionaryClient(lang as 'en' | 'es').then(setDict);
  }, [lang]);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`/api/tenants/${tenant}/pharmacy-settings`);
      const json = await res.json();
      if (json.success) setSettings(prev => ({ ...prev, ...json.data }));
    } catch {
      toast.error(dict?.admin?.failedToLoadPharmacySettings || 'Failed to load pharmacy settings');
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
        toast.success(dict?.admin?.pharmacySettingsSaved || 'Pharmacy settings saved');
      } else {
        toast.error(json.error || dict?.admin?.failedToSave || 'Failed to save');
      }
    } catch {
      toast.error(dict?.admin?.failedToLoadPharmacySettings || 'Failed to save pharmacy settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-4 sm:px-6 py-6">

      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-7 h-7 text-brand flex-shrink-0" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{dict?.admin?.pharmacyComplianceTitle || 'Pharmacy Compliance'}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{dict?.admin?.pharmacyComplianceSubtitle || 'Philippine FDA, DOH, and PDEA regulatory settings'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href={`/${tenant}/${lang}/admin/compliance`}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
          >
            {dict?.admin?.complianceStatus || 'Compliance Status'}
          </Link>
          {canManage && (
            <button
              onClick={handleSave}
              disabled={saving || loading || !hasAccess}
              className="px-4 py-2 text-sm font-medium bg-brand text-white border border-brand-hover hover:bg-brand-hover disabled:opacity-50 transition-colors"
            >
              {saving ? (dict?.admin?.saving || 'Saving...') : (dict?.admin?.saveSettings || 'Save Settings')}
            </button>
          )}
        </div>
      </div>

      {!loading && !canManage && (
        <div className="mb-6 p-3 bg-yellow-50 border border-yellow-300 text-sm text-yellow-800">
          {dict?.settings?.readOnlyNotice || "You don't have permission to change settings. Contact an admin or manager."}
        </div>
      )}

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
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>{dict?.admin?.pharmRequirementFdaLto || 'FDA License to Operate (LTO)'}</li>
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>{dict?.admin?.pharmRequirementPharmacist || 'Licensed Pharmacist (PRC)'}</li>
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>{dict?.admin?.pharmRequirementPtr || 'PTR (Professional Tax Receipt)'}</li>
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>{dict?.admin?.pharmRequirementDoh || 'DOH Accreditation'}</li>
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>{dict?.admin?.pharmRequirementPdea || 'PDEA License (dangerous drugs only)'}</li>
              </ul>
              <p className="text-xs text-gray-400 mt-4">{dict?.admin?.pharmExpiryNote || 'Set expiry dates to receive advance warnings before licenses lapse.'}</p>
            </div>
            {!hasAccess && (
              <div className="mt-3 bg-amber-50 border border-amber-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Lock className="w-4 h-4 text-amber-600" />
                  <p className="text-xs font-semibold text-amber-700">{dict?.admin?.pharmProPlanRequired || 'Pro Plan Required'}</p>
                </div>
                <p className="text-xs text-amber-600 mb-3">{dict?.admin?.pharmProPlanUpgradeDesc || 'Upgrade to unlock pharmacy compliance features.'}</p>
                <Link
                  href={`/${tenant}/${lang}/admin/subscriptions`}
                  className="block w-full text-center px-3 py-2 text-xs font-medium bg-brand text-white hover:bg-brand-hover transition-colors"
                >
                  {dict?.admin?.upgradePlan || 'Upgrade Plan'}
                </Link>
              </div>
            )}
          </aside>

          {/* Right — form sections */}
          <fieldset disabled={!canManage} className="flex-1 min-w-0 space-y-4">

            {/* Pharmacist Info */}
            <div className="relative bg-white border border-gray-300">
              {!hasAccess && <LockOverlay dict={dict} />}
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{dict?.admin?.pharmacistSectionTitle || 'Licensed Pharmacist'}</h2>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{dict?.admin?.pharmacistName || 'Pharmacist Name'}</label>
                  <input
                    type="text"
                    value={settings.pharmacistName ?? ''}
                    onChange={e => setSettings(s => ({ ...s, pharmacistName: e.target.value }))}
                    placeholder={dict?.admin?.pharmacistNamePlaceholder || 'Full name'}
                    className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{dict?.admin?.prcLicenseNumber || 'PRC License Number'}</label>
                  <input
                    type="text"
                    value={settings.pharmacistPRCNumber ?? ''}
                    onChange={e => setSettings(s => ({ ...s, pharmacistPRCNumber: e.target.value }))}
                    placeholder={dict?.admin?.prcNumberPlaceholder || 'e.g. 0123456'}
                    className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{dict?.admin?.ptrNumber || 'PTR Number'}</label>
                  <input
                    type="text"
                    value={settings.pharmacistPTRNumber ?? ''}
                    onChange={e => setSettings(s => ({ ...s, pharmacistPTRNumber: e.target.value }))}
                    placeholder={dict?.admin?.ptrNumberPlaceholder || 'Professional Tax Receipt'}
                    className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                  />
                </div>
              </div>
            </div>

            {/* FDA License */}
            <div className="relative bg-white border border-gray-300">
              {!hasAccess && <LockOverlay dict={dict} />}
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{dict?.admin?.fdaLtoSectionTitle || 'FDA License to Operate (LTO)'}</h2>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{dict?.admin?.ltoNumber || 'LTO Number'}</label>
                  <input
                    type="text"
                    value={settings.fdaLTO ?? ''}
                    onChange={e => setSettings(s => ({ ...s, fdaLTO: e.target.value }))}
                    placeholder={dict?.admin?.ltoNumberPlaceholder || 'e.g. LTO-12345678'}
                    className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{dict?.admin?.ltoExpiryDate || 'LTO Expiry Date'}</label>
                  <input
                    type="date"
                    value={settings.fdaLTOExpiryDate?.split('T')[0] ?? ''}
                    onChange={e => setSettings(s => ({ ...s, fdaLTOExpiryDate: e.target.value }))}
                    className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                  />
                  <ExpiryWarning dateStr={settings.fdaLTOExpiryDate} dict={dict} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{dict?.admin?.dohAccreditation || 'DOH Accreditation'}</label>
                  <input
                    type="text"
                    value={settings.dohAccreditation ?? ''}
                    onChange={e => setSettings(s => ({ ...s, dohAccreditation: e.target.value }))}
                    placeholder={dict?.admin?.dohAccreditationPlaceholder || 'DOH accreditation number'}
                    className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                  />
                </div>
              </div>
            </div>

            {/* PDEA */}
            <div className="relative bg-white border border-gray-300">
              {!hasAccess && <LockOverlay dict={dict} />}
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{dict?.admin?.pdeaSectionTitle || 'PDEA License'} <span className="normal-case font-normal text-gray-400">{dict?.admin?.pdeaSectionSuffix || '(dangerous drugs only)'}</span></h2>
                <p className="text-xs text-gray-400 mt-0.5">{dict?.admin?.pdeaSectionDesc || 'Required only if your pharmacy dispenses dangerous drugs (Schedule 1)'}</p>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{dict?.admin?.pdeaLicenseNumber || 'PDEA License Number'}</label>
                  <input
                    type="text"
                    value={settings.pdeaLicense ?? ''}
                    onChange={e => setSettings(s => ({ ...s, pdeaLicense: e.target.value }))}
                    placeholder={dict?.admin?.pdeaLicenseNumberPlaceholder || 'e.g. DDA-XXXXXXX'}
                    className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{dict?.admin?.pdeaLicenseExpiry || 'PDEA License Expiry'}</label>
                  <input
                    type="date"
                    value={settings.pdeaLicenseExpiry?.split('T')[0] ?? ''}
                    onChange={e => setSettings(s => ({ ...s, pdeaLicenseExpiry: e.target.value }))}
                    className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                  />
                  <ExpiryWarning dateStr={settings.pdeaLicenseExpiry} dict={dict} />
                </div>
              </div>
            </div>

            {/* Dispensing Rules */}
            <div className="relative bg-white border border-gray-300">
              {!hasAccess && <LockOverlay dict={dict} />}
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{dict?.admin?.dispensingRulesTitle || 'Dispensing Rules'}</h2>
              </div>
              <div className="p-5 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.requirePrescriptionForRx ?? true}
                    onChange={e => setSettings(s => ({ ...s, requirePrescriptionForRx: e.target.checked }))}
                    className="checkbox-win8"
                  />
                  <span className="text-sm text-gray-700">{dict?.admin?.requirePrescriptionForRx || 'Require prescription for Rx-only drugs'}</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.trackExpiryDates ?? true}
                    onChange={e => setSettings(s => ({ ...s, trackExpiryDates: e.target.checked }))}
                    className="checkbox-win8"
                  />
                  <span className="text-sm text-gray-700">{dict?.admin?.trackExpiryDatesAllProducts || 'Track expiry dates on all products'}</span>
                </label>
                <div className="flex items-center gap-3 pt-1">
                  <label className="text-xs font-medium text-gray-600 whitespace-nowrap">{dict?.admin?.alertBeforeExpiryDays || 'Alert before expiry (days)'}</label>
                  <input
                    type="number"
                    min={7}
                    max={365}
                    value={settings.expiryAlertDays ?? 90}
                    onChange={e => setSettings(s => ({ ...s, expiryAlertDays: Number(e.target.value) }))}
                    className="w-24 border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                  />
                </div>
              </div>
            </div>

          </fieldset>
        </div>
      )}
    </div>
  );
}
