'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminNavBar from '@/components/AdminNavBar';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { getDictionaryClient } from '../../dictionaries-client';
import { useBirFeatures } from '@/hooks/useBirFeatures';
import { useBirSettings } from '@/hooks/useBirSettings';
import { useCasReport } from '@/hooks/useCasReport';
import {
  ptuExpiringSoon,
  isValidCasDateRange,
  getPtuExpiryWarning,
} from '@/lib/bir-compliance-helpers';

function LockOverlay({ plan }: { plan?: string }) {
  const { tenant, lang } = useParams() as { tenant: string; lang: string };
  const label = plan || 'Pro';
  return (
    <div className="absolute inset-0 bg-gray-50 bg-opacity-90 flex items-center justify-center z-10">
      <div className="text-center px-4">
        <svg className="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <p className="text-sm text-gray-500 mb-2">Requires {label} plan or higher</p>
        <Link
          href={`/${tenant}/${lang}/admin/subscriptions`}
          className="text-blue-600 hover:text-blue-700 text-sm font-medium"
        >
          Upgrade Plan
        </Link>
      </div>
    </div>
  );
}

export default function BirCompliancePage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';

  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  const { birFeatures, loading: featuresLoading, fetchFeatures } = useBirFeatures();
  const { birSettings, setBirSettings, loading: settingsLoading, saving, fetchSettings, saveSettings } = useBirSettings(tenant);
  const { casDateRange, setCasDateRange, downloading: downloadingCas, downloadReport } = useCasReport();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchFeatures((error) => toast.error(error));
    fetchSettings((error) => toast.error(error));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  const handleSavePtuSettings = useCallback(async () => {
    if (!birSettings.birTin && !birSettings.birPtuNumber && !birSettings.birPtuIssuedDate && !birSettings.birPtuExpiryDate) {
      toast.error(dict?.common?.enterAtLeastOneField || 'Please enter at least one field.');
      return;
    }

    await saveSettings(
      (message) => toast.success(message),
      (error) => toast.error(error)
    );
  }, [birSettings, saveSettings, dict]);

  const handleDownloadCasReport = useCallback(async () => {
    if (!isValidCasDateRange(casDateRange.start, casDateRange.end)) {
      toast.error(dict?.common?.invalidDateRange || 'Invalid date range. End date must be after start date.');
      return;
    }

    await downloadReport(
      (message) => toast.success(message),
      (error) => toast.error(error)
    );
  }, [casDateRange, downloadReport, dict]);

  if (!dict || featuresLoading || settingsLoading) {
    return (
      <div className="bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50">
      <AdminNavBar />
      <div className="px-6 py-5">
        {/* Header */}
        <div className="mb-5">
          <h1 className="text-xl font-bold text-gray-900 mb-1">
            BIR Compliance
          </h1>
          <p className="text-gray-600">
            Manage your Bureau of Internal Revenue compliance settings, PTU, CAS reporting, and audit trail.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* 1. Audit Trail — always available */}
          <div className="bg-white border border-gray-200 p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-green-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Audit Trail</h2>
                <span className="inline-block text-xs bg-green-100 text-green-700 px-2 py-0.5 mt-1">All Plans</span>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Complete record of all transactions, user actions, and system events. Required for BIR compliance and available on all subscription plans.
            </p>
            <Link
              href={`/${tenant}/${lang}/admin/audit-logs`}
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              View Audit Logs
            </Link>
          </div>

          {/* 2. Receipt Formatting */}
          <div className="relative bg-white border border-gray-200 p-5 overflow-hidden">
            {!birFeatures?.receiptFormatting && <LockOverlay plan="Pro" />}
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-blue-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Receipt Formatting</h2>
                <span className="inline-block text-xs bg-blue-100 text-blue-700 px-2 py-0.5 mt-1">Pro+</span>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Customize BIR-compliant receipt templates with official receipt numbering, TIN display, VAT breakdown, and required fields.
            </p>
            <Link
              href={`/${tenant}/${lang}/admin/hardware`}
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Configure Receipt Templates
            </Link>
          </div>

          {/* 3. PTU Assistance */}
          <div className="relative bg-white border border-gray-200 p-5 overflow-hidden">
            {!birFeatures?.ptuAssistance && <LockOverlay plan="Pro" />}
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-yellow-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 9l-3 3m0 0l-3-3m3 3V4m0 13a9 9 0 110-18 9 9 0 010 18z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">PTU Assistance</h2>
                <span className="inline-block text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 mt-1">Pro+</span>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Store and track your BIR Permit to Use (PTU) details and Tax Identification Number (TIN) for your POS system.
            </p>

            {ptuExpiringSoon(birSettings.birPtuExpiryDate) && birFeatures?.ptuAssistance && (
              <div className="mb-4 p-3 bg-orange-50 border border-orange-200 text-orange-800 text-sm">
                {getPtuExpiryWarning(birSettings.birPtuExpiryDate, dict)}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  BIR TIN <span className="text-gray-400 font-normal">(NNN-NNN-NNN-NNN)</span>
                </label>
                <input
                  type="text"
                  value={birSettings.birTin}
                  onChange={(e) => setBirSettings({ ...birSettings, birTin: e.target.value })}
                  placeholder="000-000-000-000"
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PTU Number</label>
                <input
                  type="text"
                  value={birSettings.birPtuNumber}
                  onChange={(e) => setBirSettings({ ...birSettings, birPtuNumber: e.target.value })}
                  placeholder="e.g. POS-0001-2024"
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PTU Issued Date</label>
                  <input
                    type="date"
                    value={birSettings.birPtuIssuedDate}
                    onChange={(e) => setBirSettings({ ...birSettings, birPtuIssuedDate: e.target.value })}
                    className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PTU Expiry Date</label>
                  <input
                    type="date"
                    value={birSettings.birPtuExpiryDate}
                    onChange={(e) => setBirSettings({ ...birSettings, birPtuExpiryDate: e.target.value })}
                    className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <button
                onClick={handleSavePtuSettings}
                disabled={saving || !birFeatures?.ptuAssistance}
                className="w-full bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save PTU Settings'}
              </button>
            </div>
          </div>

          {/* 4. CAS Reporting */}
          <div className="relative bg-white border border-gray-200 p-5 overflow-hidden">
            {!birFeatures?.casReporting && <LockOverlay plan="Business" />}
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-purple-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">CAS Reporting</h2>
                <span className="inline-block text-xs bg-purple-100 text-purple-700 px-2 py-0.5 mt-1">Business+</span>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Export your sales data in BIR Computerized Accounting System (CAS) format. Download a CSV with VAT breakdown for BIR submission.
            </p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={casDateRange.start}
                    onChange={(e) => setCasDateRange({ ...casDateRange, start: e.target.value })}
                    className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={casDateRange.end}
                    onChange={(e) => setCasDateRange({ ...casDateRange, end: e.target.value })}
                    className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <button
                onClick={handleDownloadCasReport}
                disabled={downloadingCas || !birFeatures?.casReporting}
                className="w-full inline-flex items-center justify-center gap-2 bg-purple-600 text-white px-4 py-2 text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {downloadingCas ? 'Generating...' : 'Download CAS Report (CSV)'}
              </button>
            </div>
          </div>

          {/* 5. Monthly Support */}
          <div className="relative bg-white border border-gray-200 p-5 overflow-hidden lg:col-span-2">
            {!birFeatures?.monthlySupport && <LockOverlay plan="Business" />}
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-green-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Monthly BIR Compliance Support</h2>
                <span className="inline-block text-xs bg-green-100 text-green-700 px-2 py-0.5 mt-1">Business+</span>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Get dedicated monthly support for BIR compliance — including assistance with VAT filings, PTU renewals, CAS submissions, and documentation review.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="border border-gray-200 p-4">
                <div className="text-sm font-medium text-gray-900 mb-1">VAT Filing Assistance</div>
                <p className="text-xs text-gray-500">Monthly 2550M and quarterly 2550Q filing guidance</p>
              </div>
              <div className="border border-gray-200 p-4">
                <div className="text-sm font-medium text-gray-900 mb-1">PTU Renewal</div>
                <p className="text-xs text-gray-500">Annual Permit to Use renewal reminders and support</p>
              </div>
              <div className="border border-gray-200 p-4">
                <div className="text-sm font-medium text-gray-900 mb-1">CAS Submission</div>
                <p className="text-xs text-gray-500">Help with BIR CAS accreditation and periodic submissions</p>
              </div>
            </div>
            <div className="mt-4 p-3 bg-green-50 border border-green-200 text-green-800 text-sm">
              Your plan includes monthly compliance support. Contact your account manager or open a support ticket to get started.
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
