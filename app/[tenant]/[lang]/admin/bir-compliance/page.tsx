'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../dictionaries-client';

interface BirComplianceFeatures {
  ptuAssistance: boolean;
  receiptFormatting: boolean;
  birDocumentation: boolean;
  casReporting: boolean;
  auditTrailSystem: boolean;
  monthlySupport: boolean;
}

interface BirSettings {
  birTin: string;
  birPtuNumber: string;
  birPtuIssuedDate: string;
  birPtuExpiryDate: string;
}

interface Message {
  type: 'success' | 'error';
  text: string;
}

function LockOverlay({ plan }: { plan?: string }) {
  const { tenant, lang } = useParams() as { tenant: string; lang: string };
  const label = plan || 'Pro';
  return (
    <div className="absolute inset-0 bg-gray-50 bg-opacity-90 flex items-center justify-center z-10 rounded">
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
  const [loading, setLoading] = useState(true);
  const [birFeatures, setBirFeatures] = useState<BirComplianceFeatures | null>(null);
  const [birSettings, setBirSettings] = useState<BirSettings>({
    birTin: '',
    birPtuNumber: '',
    birPtuIssuedDate: '',
    birPtuExpiryDate: '',
  });
  const [saving, setSaving] = useState(false);
  const [casDateRange, setCasDateRange] = useState({ start: '', end: '' });
  const [downloadingCas, setDownloadingCas] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, tenant]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [subRes, birRes] = await Promise.all([
        fetch('/api/subscription/status'),
        fetch(`/api/tenants/${tenant}/bir-settings`),
      ]);

      const subData = await subRes.json();
      if (subData.success && subData.data?.birCompliance) {
        setBirFeatures(subData.data.birCompliance);
      } else if (subData.success && subData.data) {
        // Fallback: no birCompliance in status means all locked
        setBirFeatures({
          ptuAssistance: false,
          receiptFormatting: false,
          birDocumentation: false,
          casReporting: false,
          auditTrailSystem: true,
          monthlySupport: false,
        });
      }

      const birData = await birRes.json();
      if (birData.success && birData.data) {
        setBirSettings({
          birTin: birData.data.birTin || '',
          birPtuNumber: birData.data.birPtuNumber || '',
          birPtuIssuedDate: birData.data.birPtuIssuedDate
            ? new Date(birData.data.birPtuIssuedDate).toISOString().split('T')[0]
            : '',
          birPtuExpiryDate: birData.data.birPtuExpiryDate
            ? new Date(birData.data.birPtuExpiryDate).toISOString().split('T')[0]
            : '',
        });
      }
    } catch (err) {
      console.error('Error fetching BIR data:', err);
    } finally {
      setLoading(false);
    }
  };

  const savePtuSettings = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/tenants/${tenant}/bir-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          birTin: birSettings.birTin || undefined,
          birPtuNumber: birSettings.birPtuNumber || undefined,
          birPtuIssuedDate: birSettings.birPtuIssuedDate || undefined,
          birPtuExpiryDate: birSettings.birPtuExpiryDate || undefined,
        }),
      });
      const data = await res.json();
      setMessage(
        data.success
          ? { type: 'success', text: 'BIR settings saved successfully.' }
          : { type: 'error', text: data.error || 'Failed to save.' }
      );
    } catch {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const downloadCasReport = async () => {
    setDownloadingCas(true);
    setMessage(null);
    try {
      const params = new URLSearchParams();
      if (casDateRange.start) params.set('startDate', casDateRange.start);
      if (casDateRange.end) params.set('endDate', casDateRange.end);

      const res = await fetch(`/api/reports/cas?${params}`, { credentials: 'include' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to generate report' }));
        setMessage({ type: 'error', text: err.error });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cas-report${casDateRange.start ? `-${casDateRange.start}` : ''}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setMessage({ type: 'error', text: 'Failed to download CAS report.' });
    } finally {
      setDownloadingCas(false);
    }
  };

  const ptuExpiringSoon = (): boolean => {
    if (!birSettings.birPtuExpiryDate) return false;
    const expiry = new Date(birSettings.birPtuExpiryDate);
    const thirtyDays = new Date();
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    return expiry <= thirtyDays;
  };

  if (!dict || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <Link
            href={`/${tenant}/${lang}/admin`}
            className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium mb-4 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {dict?.admin?.backToAdmin || 'Back to Admin'}
          </Link>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
            BIR Compliance
          </h1>
          <p className="text-gray-600">
            Manage your Bureau of Internal Revenue compliance settings, PTU, CAS reporting, and audit trail.
          </p>
        </div>

        {/* Status message */}
        {message && (
          <div className={`mb-6 p-4 border ${message.type === 'success' ? 'bg-green-50 border-green-300 text-green-800' : 'bg-red-50 border-red-300 text-red-800'}`}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* 1. Audit Trail — always available */}
          <div className="bg-white border border-gray-300 p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-green-100 flex items-center justify-center rounded">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Audit Trail</h2>
                <span className="inline-block text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded mt-1">All Plans</span>
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
          <div className="relative bg-white border border-gray-300 p-6 overflow-hidden">
            {!birFeatures?.receiptFormatting && <LockOverlay plan="Pro" />}
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-blue-100 flex items-center justify-center rounded">
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Receipt Formatting</h2>
                <span className="inline-block text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded mt-1">Pro+</span>
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
          <div className="relative bg-white border border-gray-300 p-6 overflow-hidden">
            {!birFeatures?.ptuAssistance && <LockOverlay plan="Pro" />}
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-yellow-100 flex items-center justify-center rounded">
                <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 9l-3 3m0 0l-3-3m3 3V4m0 13a9 9 0 110-18 9 9 0 010 18z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">PTU Assistance</h2>
                <span className="inline-block text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded mt-1">Pro+</span>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Store and track your BIR Permit to Use (PTU) details and Tax Identification Number (TIN) for your POS system.
            </p>

            {ptuExpiringSoon() && birFeatures?.ptuAssistance && (
              <div className="mb-4 p-3 bg-orange-50 border border-orange-200 text-orange-800 text-sm">
                <strong>Warning:</strong> Your PTU expires on {birSettings.birPtuExpiryDate}. Please renew with BIR.
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
                onClick={savePtuSettings}
                disabled={saving || !birFeatures?.ptuAssistance}
                className="w-full bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save PTU Settings'}
              </button>
            </div>
          </div>

          {/* 4. CAS Reporting */}
          <div className="relative bg-white border border-gray-300 p-6 overflow-hidden">
            {!birFeatures?.casReporting && <LockOverlay plan="Business" />}
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-purple-100 flex items-center justify-center rounded">
                <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">CAS Reporting</h2>
                <span className="inline-block text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded mt-1">Business+</span>
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
                onClick={downloadCasReport}
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
          <div className="relative bg-white border border-gray-300 p-6 overflow-hidden lg:col-span-2">
            {!birFeatures?.monthlySupport && <LockOverlay plan="Business" />}
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-green-100 flex items-center justify-center rounded">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Monthly BIR Compliance Support</h2>
                <span className="inline-block text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded mt-1">Business+</span>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Get dedicated monthly support for BIR compliance — including assistance with VAT filings, PTU renewals, CAS submissions, and documentation review.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="border border-gray-200 p-4 rounded">
                <div className="text-sm font-medium text-gray-900 mb-1">VAT Filing Assistance</div>
                <p className="text-xs text-gray-500">Monthly 2550M and quarterly 2550Q filing guidance</p>
              </div>
              <div className="border border-gray-200 p-4 rounded">
                <div className="text-sm font-medium text-gray-900 mb-1">PTU Renewal</div>
                <p className="text-xs text-gray-500">Annual Permit to Use renewal reminders and support</p>
              </div>
              <div className="border border-gray-200 p-4 rounded">
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
