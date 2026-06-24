'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ShieldCheck, AlertTriangle, Lock } from 'lucide-react';

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

function LockOverlay() {
  const { tenant, lang } = useParams() as { tenant: string; lang: string };
  return (
    <div className="absolute inset-0 bg-gray-50 bg-opacity-90 flex items-center justify-center z-10">
      <div className="text-center px-4">
        <Lock className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-sm text-gray-500 mb-2">Requires Pro plan or higher</p>
        <Link href={`/${tenant}/${lang}/admin/subscriptions`} className="text-brand hover:text-brand-hover text-sm font-medium">
          Upgrade Plan
        </Link>
      </div>
    </div>
  );
}

export default function PharmacyCompliancePage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;

  const [settings, setSettings] = useState<PharmacySettings>({
    requirePrescriptionForRx: true,
    trackExpiryDates: true,
    expiryAlertDays: 90,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasAccess, setHasAccess] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`/api/tenants/${tenant}/pharmacy-settings`);
      const json = await res.json();
      if (json.success) setSettings(prev => ({ ...prev, ...json.data }));
    } catch {
      toast.error('Failed to load pharmacy settings');
    } finally {
      setLoading(false);
    }
  }, [tenant]);

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
        toast.success('Pharmacy settings saved');
      } else {
        toast.error(json.error || 'Failed to save');
      }
    } catch {
      toast.error('Failed to save pharmacy settings');
    } finally {
      setSaving(false);
    }
  };

  const fdaExpiry = settings.fdaLTOExpiryDate ? new Date(settings.fdaLTOExpiryDate) : null;
  const fdaDaysLeft = fdaExpiry ? Math.ceil((fdaExpiry.getTime() - Date.now()) / 86400000) : null;
  const fdaWarning = fdaDaysLeft !== null && fdaDaysLeft <= 30;

  return (
    <div className="px-4 sm:px-6 py-6">

      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-7 h-7 text-brand flex-shrink-0" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pharmacy Compliance</h1>
            <p className="text-sm text-gray-500 mt-0.5">Philippine FDA, DOH, and PDEA regulatory settings</p>
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
            disabled={saving || loading || !hasAccess}
            className="px-4 py-2 text-sm font-medium bg-brand text-white border border-brand-hover hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Settings'}
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
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>FDA License to Operate (LTO)</li>
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>Licensed Pharmacist (PRC)</li>
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>PTR (Professional Tax Receipt)</li>
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>DOH Accreditation</li>
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>PDEA License (dangerous drugs only)</li>
              </ul>
              <p className="text-xs text-gray-400 mt-4">Set expiry dates to receive advance warnings before licenses lapse.</p>
            </div>
            {!hasAccess && (
              <div className="mt-3 bg-amber-50 border border-amber-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Lock className="w-4 h-4 text-amber-600" />
                  <p className="text-xs font-semibold text-amber-700">Pro Plan Required</p>
                </div>
                <p className="text-xs text-amber-600 mb-3">Upgrade to unlock pharmacy compliance features.</p>
                <Link
                  href={`/${tenant}/${lang}/admin/subscriptions`}
                  className="block w-full text-center px-3 py-2 text-xs font-medium bg-brand text-white hover:bg-brand-hover transition-colors"
                >
                  Upgrade Plan
                </Link>
              </div>
            )}
          </aside>

          {/* Right — form sections */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Pharmacist Info */}
            <div className="relative bg-white border border-gray-300">
              {!hasAccess && <LockOverlay />}
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Licensed Pharmacist</h2>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Pharmacist Name</label>
                  <input
                    type="text"
                    value={settings.pharmacistName ?? ''}
                    onChange={e => setSettings(s => ({ ...s, pharmacistName: e.target.value }))}
                    placeholder="Full name"
                    className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">PRC License Number</label>
                  <input
                    type="text"
                    value={settings.pharmacistPRCNumber ?? ''}
                    onChange={e => setSettings(s => ({ ...s, pharmacistPRCNumber: e.target.value }))}
                    placeholder="e.g. 0123456"
                    className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">PTR Number</label>
                  <input
                    type="text"
                    value={settings.pharmacistPTRNumber ?? ''}
                    onChange={e => setSettings(s => ({ ...s, pharmacistPTRNumber: e.target.value }))}
                    placeholder="Professional Tax Receipt"
                    className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                  />
                </div>
              </div>
            </div>

            {/* FDA License */}
            <div className="relative bg-white border border-gray-300">
              {!hasAccess && <LockOverlay />}
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">FDA License to Operate (LTO)</h2>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">LTO Number</label>
                  <input
                    type="text"
                    value={settings.fdaLTO ?? ''}
                    onChange={e => setSettings(s => ({ ...s, fdaLTO: e.target.value }))}
                    placeholder="e.g. LTO-12345678"
                    className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">LTO Expiry Date</label>
                  <input
                    type="date"
                    value={settings.fdaLTOExpiryDate?.split('T')[0] ?? ''}
                    onChange={e => setSettings(s => ({ ...s, fdaLTOExpiryDate: e.target.value }))}
                    className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                  />
                  {fdaWarning && (
                    <p className="flex items-center gap-1 text-amber-600 text-xs mt-1 font-medium">
                      <AlertTriangle className="w-3 h-3" />
                      {fdaDaysLeft! < 0 ? 'LTO has expired!' : `Expires in ${fdaDaysLeft} day(s)`}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">DOH Accreditation</label>
                  <input
                    type="text"
                    value={settings.dohAccreditation ?? ''}
                    onChange={e => setSettings(s => ({ ...s, dohAccreditation: e.target.value }))}
                    placeholder="DOH accreditation number"
                    className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                  />
                </div>
              </div>
            </div>

            {/* PDEA */}
            <div className="relative bg-white border border-gray-300">
              {!hasAccess && <LockOverlay />}
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">PDEA License <span className="normal-case font-normal text-gray-400">(dangerous drugs only)</span></h2>
                <p className="text-xs text-gray-400 mt-0.5">Required only if your pharmacy dispenses dangerous drugs (Schedule 1)</p>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">PDEA License Number</label>
                  <input
                    type="text"
                    value={settings.pdeaLicense ?? ''}
                    onChange={e => setSettings(s => ({ ...s, pdeaLicense: e.target.value }))}
                    placeholder="e.g. DDA-XXXXXXX"
                    className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">PDEA License Expiry</label>
                  <input
                    type="date"
                    value={settings.pdeaLicenseExpiry?.split('T')[0] ?? ''}
                    onChange={e => setSettings(s => ({ ...s, pdeaLicenseExpiry: e.target.value }))}
                    className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                  />
                </div>
              </div>
            </div>

            {/* Dispensing Rules */}
            <div className="relative bg-white border border-gray-300">
              {!hasAccess && <LockOverlay />}
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Dispensing Rules</h2>
              </div>
              <div className="p-5 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.requirePrescriptionForRx ?? true}
                    onChange={e => setSettings(s => ({ ...s, requirePrescriptionForRx: e.target.checked }))}
                    className="w-4 h-4 accent-brand"
                  />
                  <span className="text-sm text-gray-700">Require prescription for Rx-only drugs</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.trackExpiryDates ?? true}
                    onChange={e => setSettings(s => ({ ...s, trackExpiryDates: e.target.checked }))}
                    className="w-4 h-4 accent-brand"
                  />
                  <span className="text-sm text-gray-700">Track expiry dates on all products</span>
                </label>
                <div className="flex items-center gap-3 pt-1">
                  <label className="text-xs font-medium text-gray-600 whitespace-nowrap">Alert before expiry (days)</label>
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

          </div>
        </div>
      )}
    </div>
  );
}
