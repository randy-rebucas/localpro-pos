'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { showToast } from '@/lib/toast';
import { getDictionaryClient } from '../../dictionaries-client';
import { useBirFeatures } from '@/hooks/useBirFeatures';
import { useBirSettings } from '@/hooks/useBirSettings';
import { useCasReport } from '@/hooks/useCasReport';
import { usePermissions } from '@/hooks/usePermissions';
import {
  ptuExpiringSoon,
  isValidCasDateRange,
  getPtuExpiryWarning,
} from '@/lib/bir-compliance-helpers';

type Tier = 'all' | 'pro' | 'business';

const TIER_BADGE: Record<Tier, string> = {
  all: 'bg-win8-success text-white',
  pro: 'bg-brand text-white',
  business: 'bg-brand-navy text-white',
};

const INPUT = 'w-full border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900 disabled:bg-gray-100';
const LABEL = 'block text-xs font-medium text-gray-600 mb-1';

function LockOverlay({ plan, dict }: { plan?: string; dict: any }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { tenant, lang } = useParams() as { tenant: string; lang: string };
  const label = plan || 'Pro';
  return (
    <div className="absolute inset-0 bg-gray-50/90 flex items-center justify-center z-10">
      <div className="text-center px-4">
        <svg className="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <p className="text-sm text-gray-500 mb-3">
          {(dict?.bir?.requiresPlan || 'Requires {plan} plan or higher').replace('{plan}', label)}
        </p>
        <Link
          href={`/${tenant}/${lang}/admin/subscriptions`}
          className="inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors"
        >
          {dict?.bir?.upgradePlan || 'Upgrade Plan'}
        </Link>
      </div>
    </div>
  );
}

function FeatureCard({ iconPath, title, tier, dict, lockedPlan, className = '', children }: {
  iconPath: string | string[];
  title: string;
  tier: Tier;
  dict: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** Plan name to show in the lock overlay; omit when the feature is unlocked. */
  lockedPlan?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const tierLabel = {
    all: dict?.bir?.allPlans || 'All Plans',
    pro: dict?.bir?.planBadgePro || 'Pro+',
    business: dict?.bir?.planBadgeBusiness || 'Business+',
  }[tier];
  return (
    <section className={`relative bg-white border border-gray-300 flex flex-col ${className}`}>
      {lockedPlan && <LockOverlay plan={lockedPlan} dict={dict} />}
      <div className="px-6 py-4 border-b border-gray-300 flex items-center gap-3">
        <span className="w-9 h-9 shrink-0 bg-brand text-white flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            {(Array.isArray(iconPath) ? iconPath : [iconPath]).map(d => (
              <path key={d} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
            ))}
          </svg>
        </span>
        <h2 className="text-base font-bold text-gray-900 flex-1 min-w-0">{title}</h2>
        <span className={`shrink-0 px-2 py-0.5 text-xs font-semibold ${TIER_BADGE[tier]}`}>{tierLabel}</span>
      </div>
      <div className="p-6 flex-1">{children}</div>
    </section>
  );
}

export default function BirCompliancePage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const { canAccess } = usePermissions();
  const canManage = canAccess('bir_compliance.manage');

  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [loadFailed, setLoadFailed] = useState(false);

  const { birFeatures, loading: featuresLoading, fetchFeatures } = useBirFeatures();
  const { birSettings, setBirSettings, loading: settingsLoading, saving, fetchSettings, saveSettings } = useBirSettings(tenant);
  const { casDateRange, setCasDateRange, downloading: downloadingCas, downloadReport } = useCasReport();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const loadAll = () => {
    setLoadFailed(false);
    fetchFeatures(() => setLoadFailed(true));
    fetchSettings(() => setLoadFailed(true));
  };

  useEffect(() => {
    loadAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  const handleSavePtuSettings = useCallback(async () => {
    if (!birSettings.birTin && !birSettings.birPtuNumber && !birSettings.birPtuIssuedDate && !birSettings.birPtuExpiryDate) {
      showToast.error(dict?.common?.enterAtLeastOneField || 'Please enter at least one field.');
      return;
    }

    await saveSettings(
      (message) => showToast.success(message),
      (error) => showToast.error(error)
    );
  }, [birSettings, saveSettings, dict]);

  const handleDownloadCasReport = useCallback(async () => {
    if (!isValidCasDateRange(casDateRange.start, casDateRange.end)) {
      showToast.error(dict?.common?.invalidDateRange || 'Invalid date range. End date must be after start date.');
      return;
    }

    await downloadReport(
      (message) => showToast.success(message),
      (error) => showToast.error(error)
    );
  }, [casDateRange, downloadReport, dict]);

  const loading = !dict || featuresLoading || settingsLoading;

  return (
    <div className="px-4 sm:px-6 py-6">
      <AdminPageHeader
        title={dict?.bir?.title || 'BIR Compliance'}
        description={dict?.bir?.subtitle || 'Manage your Bureau of Internal Revenue compliance settings, PTU, CAS reporting, and audit trail.'}
      />

      {loading ? (
        <div className="text-center py-12 bg-white border border-gray-300">
          <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
          <p className="mt-3 text-gray-400 text-sm">{dict?.bir?.loading || 'Loading BIR compliance…'}</p>
        </div>
      ) : loadFailed ? (
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-win8-danger text-sm font-medium">{dict?.bir?.loadFailed || 'Failed to load BIR compliance settings'}</p>
          <button
            onClick={loadAll}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
          >
            {dict?.common?.retry || 'Retry'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* 1. Audit Trail — always available */}
          <FeatureCard
            iconPath="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            title={dict?.bir?.auditTrail || 'Audit Trail'}
            tier="all"
            dict={dict}
          >
            <p className="text-sm text-gray-600 mb-4">
              {dict?.bir?.auditTrailDesc || 'Complete record of all transactions, user actions, and system events. Required for BIR compliance and available on all subscription plans.'}
            </p>
            <Link
              href={`/${tenant}/${lang}/admin/audit-logs`}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors"
            >
              {dict?.bir?.viewAuditLogs || 'View Audit Logs'}
            </Link>
          </FeatureCard>

          {/* 2. Receipt Formatting */}
          <FeatureCard
            iconPath="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            title={dict?.bir?.receiptFormatting || 'Receipt Formatting'}
            tier="pro"
            dict={dict}
            lockedPlan={birFeatures?.receiptFormatting ? undefined : 'Pro'}
          >
            <p className="text-sm text-gray-600 mb-4">
              {dict?.bir?.receiptFormattingDesc || 'Customize BIR-compliant receipt templates with official receipt numbering, TIN display, VAT breakdown, and required fields.'}
            </p>
            <Link
              href={`/${tenant}/${lang}/admin/hardware`}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors"
            >
              {dict?.bir?.configureReceiptTemplates || 'Configure Receipt Templates'}
            </Link>
          </FeatureCard>

          {/* 3. PTU Assistance */}
          <FeatureCard
            iconPath="M15 9l-3 3m0 0l-3-3m3 3V4m0 13a9 9 0 110-18 9 9 0 010 18z"
            title={dict?.bir?.ptuAssistance || 'PTU Assistance'}
            tier="pro"
            dict={dict}
            lockedPlan={birFeatures?.ptuAssistance ? undefined : 'Pro'}
          >
            <p className="text-sm text-gray-600 mb-4">
              {dict?.bir?.ptuAssistanceDesc || 'Store and track your BIR Permit to Use (PTU) details and Tax Identification Number (TIN) for your POS system.'}
            </p>

            {ptuExpiringSoon(birSettings.birPtuExpiryDate) && birFeatures?.ptuAssistance && (
              <div className="mb-4 p-3 bg-white border border-win8-warning text-win8-warning text-sm font-medium">
                {getPtuExpiryWarning(birSettings.birPtuExpiryDate, dict)}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="bir-tin" className={LABEL}>
                  {dict?.bir?.birTin || 'BIR TIN'} <span className="text-gray-400 font-normal font-mono">(NNN-NNN-NNN-NNN)</span>
                </label>
                <input
                  id="bir-tin"
                  type="text"
                  disabled={!canManage}
                  value={birSettings.birTin}
                  onChange={(e) => setBirSettings({ ...birSettings, birTin: e.target.value })}
                  placeholder="000-000-000-000"
                  className={`${INPUT} font-mono`}
                />
              </div>
              <div>
                <label htmlFor="bir-ptu" className={LABEL}>{dict?.bir?.ptuNumber || 'PTU Number'}</label>
                <input
                  id="bir-ptu"
                  type="text"
                  disabled={!canManage}
                  value={birSettings.birPtuNumber}
                  onChange={(e) => setBirSettings({ ...birSettings, birPtuNumber: e.target.value })}
                  placeholder={dict?.bir?.ptuNumberPlaceholder || 'e.g. POS-0001-2024'}
                  className={`${INPUT} font-mono`}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="bir-ptu-issued" className={LABEL}>{dict?.bir?.ptuIssuedDate || 'PTU Issued Date'}</label>
                  <input
                    id="bir-ptu-issued"
                    type="date"
                    disabled={!canManage}
                    value={birSettings.birPtuIssuedDate}
                    onChange={(e) => setBirSettings({ ...birSettings, birPtuIssuedDate: e.target.value })}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label htmlFor="bir-ptu-expiry" className={LABEL}>{dict?.bir?.ptuExpiryDate || 'PTU Expiry Date'}</label>
                  <input
                    id="bir-ptu-expiry"
                    type="date"
                    disabled={!canManage}
                    value={birSettings.birPtuExpiryDate}
                    onChange={(e) => setBirSettings({ ...birSettings, birPtuExpiryDate: e.target.value })}
                    className={INPUT}
                  />
                </div>
              </div>
              <button
                onClick={handleSavePtuSettings}
                disabled={!canManage || saving || !birFeatures?.ptuAssistance}
                className="w-full py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
              >
                {saving ? (dict?.common?.saving || 'Saving…') : (dict?.bir?.savePtuSettings || 'Save PTU Settings')}
              </button>
            </div>
          </FeatureCard>

          {/* 4. CAS Reporting */}
          <FeatureCard
            iconPath="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            title={dict?.bir?.casReporting || 'CAS Reporting'}
            tier="business"
            dict={dict}
            lockedPlan={birFeatures?.casReporting ? undefined : 'Business'}
          >
            <p className="text-sm text-gray-600 mb-4">
              {dict?.bir?.casReportingDesc || 'Export your sales data in BIR Computerized Accounting System (CAS) format. Download a CSV with VAT breakdown for BIR submission.'}
            </p>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cas-start" className={LABEL}>{dict?.bir?.startDate || 'Start Date'}</label>
                  <input
                    id="cas-start"
                    type="date"
                    value={casDateRange.start}
                    onChange={(e) => setCasDateRange({ ...casDateRange, start: e.target.value })}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label htmlFor="cas-end" className={LABEL}>{dict?.bir?.endDate || 'End Date'}</label>
                  <input
                    id="cas-end"
                    type="date"
                    value={casDateRange.end}
                    onChange={(e) => setCasDateRange({ ...casDateRange, end: e.target.value })}
                    className={INPUT}
                  />
                </div>
              </div>
              <button
                onClick={handleDownloadCasReport}
                disabled={downloadingCas || !birFeatures?.casReporting}
                className="w-full inline-flex items-center justify-center gap-2 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {downloadingCas ? (dict?.bir?.generating || 'Generating…') : (dict?.bir?.downloadCasReport || 'Download CAS Report (CSV)')}
              </button>
            </div>
          </FeatureCard>

          {/* 5. Monthly Support */}
          <FeatureCard
            iconPath="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"
            title={dict?.bir?.monthlySupport || 'Monthly BIR Compliance Support'}
            tier="business"
            dict={dict}
            lockedPlan={birFeatures?.monthlySupport ? undefined : 'Business'}
            className="lg:col-span-2"
          >
            <p className="text-sm text-gray-600 mb-4">
              {dict?.bir?.monthlySupportDesc || 'Get dedicated monthly support for BIR compliance — including assistance with VAT filings, PTU renewals, CAS submissions, and documentation review.'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                [dict?.bir?.vatFilingAssistance || 'VAT Filing Assistance', dict?.bir?.vatFilingAssistanceDesc || 'Monthly 2550M and quarterly 2550Q filing guidance'],
                [dict?.bir?.ptuRenewal || 'PTU Renewal', dict?.bir?.ptuRenewalDesc || 'Annual Permit to Use renewal reminders and support'],
                [dict?.bir?.casSubmission || 'CAS Submission', dict?.bir?.casSubmissionDesc || 'Help with BIR CAS accreditation and periodic submissions'],
              ].map(([name, desc]) => (
                <div key={name} className="border border-gray-300 p-4">
                  <p className="text-sm font-semibold text-gray-900 mb-1">{name}</p>
                  <p className="text-xs text-gray-500">{desc}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 bg-brand-soft border border-brand p-4 text-sm text-brand-navy">
              {dict?.bir?.monthlySupportContact || 'Your plan includes monthly compliance support. Contact your account manager or open a support ticket to get started.'}
            </div>
          </FeatureCard>

        </div>
      )}
    </div>
  );
}
