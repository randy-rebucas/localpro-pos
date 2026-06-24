'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Briefcase, Plus, Trash2, AlertTriangle } from 'lucide-react';

interface PractitionerLicense {
  name: string;
  licenseType: string;
  prcNumber?: string;
  ptrNumber?: string;
  licenseExpiry?: string;
}

interface ServiceCompliance {
  dohAccreditation?: string;
  dohAccreditationExpiry?: string;
  practitionerLicenses?: PractitionerLicense[];
}

function ExpiryWarning({ dateStr }: { dateStr?: string }) {
  if (!dateStr) return null;
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
  if (days > 30) return null;
  return (
    <p className="flex items-center gap-1 text-xs mt-1 font-medium text-amber-600">
      <AlertTriangle className="w-3 h-3" />
      {days < 0 ? `Expired ${Math.abs(days)} day(s) ago` : `Expires in ${days} day(s)`}
    </p>
  );
}

const BLANK_LICENSE: PractitionerLicense = { name: '', licenseType: '', prcNumber: '', ptrNumber: '', licenseExpiry: '' };

export default function ServiceCompliancePage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;

  const [data, setData] = useState<ServiceCompliance>({ practitionerLicenses: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/tenants/${tenant}/service-compliance`);
      const json = await res.json();
      if (json.success) setData({ practitionerLicenses: [], ...json.data });
    } catch { toast.error('Failed to load service compliance'); }
    finally { setLoading(false); }
  }, [tenant]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenant}/service-compliance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) toast.success('Service compliance settings saved');
      else toast.error(json.error || 'Failed to save');
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  const updateLicense = (idx: number, field: keyof PractitionerLicense, value: string) => {
    setData(d => {
      const licenses = [...(d.practitionerLicenses ?? [])];
      licenses[idx] = { ...licenses[idx], [field]: value };
      return { ...d, practitionerLicenses: licenses };
    });
  };

  const addLicense = () => setData(d => ({ ...d, practitionerLicenses: [...(d.practitionerLicenses ?? []), { ...BLANK_LICENSE }] }));
  const removeLicense = (idx: number) => setData(d => ({ ...d, practitionerLicenses: (d.practitionerLicenses ?? []).filter((_, i) => i !== idx) }));

  const LICENSE_TYPES = ['Beautician', 'Cosmetologist', 'Massage Therapist', 'Barber', 'Manicurist', 'Pedicurist', 'Aesthetician', 'Physical Therapist', 'Occupational Therapist', 'Nutritionist-Dietitian', 'Other'];

  return (
    <div className="px-4 sm:px-6 py-6">

      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <Briefcase className="w-7 h-7 text-brand flex-shrink-0" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Service Business Compliance</h1>
            <p className="text-sm text-gray-500 mt-0.5">DOH accreditation and PRC practitioner licenses for service businesses</p>
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
            disabled={saving || loading}
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
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>DOH Accreditation (health-related services)</li>
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>PRC License per practitioner</li>
                <li className="flex gap-2"><span className="text-brand font-bold mt-0.5">·</span>PTR (Professional Tax Receipt)</li>
              </ul>
              <p className="text-xs text-gray-400 mt-4">Set expiry dates to receive advance warnings before licenses lapse.</p>
            </div>
          </aside>

          {/* Right — form sections */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* DOH Accreditation */}
            <div className="bg-white border border-gray-300">
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">DOH Accreditation</h2>
                <p className="text-xs text-gray-400 mt-0.5">Required for health-related service businesses (massage, spa, wellness centers, etc.)</p>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">DOH Accreditation Number</label>
                  <input type="text" value={data.dohAccreditation ?? ''} onChange={e => setData(d => ({ ...d, dohAccreditation: e.target.value }))} placeholder="DOH accreditation number"
                    className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Accreditation Expiry</label>
                  <input type="date" value={data.dohAccreditationExpiry?.split('T')[0] ?? ''} onChange={e => setData(d => ({ ...d, dohAccreditationExpiry: e.target.value }))}
                    className="w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand" />
                  <ExpiryWarning dateStr={data.dohAccreditationExpiry} />
                </div>
              </div>
            </div>

            {/* Practitioner Licenses */}
            <div className="bg-white border border-gray-300">
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <div>
                  <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Practitioner Licenses</h2>
                  <p className="text-xs text-gray-400 mt-0.5">PRC licenses for all practitioners / professionals on staff</p>
                </div>
                <button onClick={addLicense} className="flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-hover">
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
              <div className="p-5">
                {(data.practitionerLicenses ?? []).length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No practitioner licenses added yet.</p>
                ) : (
                  <div className="space-y-4">
                    {(data.practitionerLicenses ?? []).map((lic, idx) => (
                      <div key={idx} className="border border-gray-200 p-4 relative">
                        <button onClick={() => removeLicense(idx)} className="absolute top-3 right-3 text-gray-300 hover:text-red-400">
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
                            <input type="text" value={lic.name} onChange={e => updateLicense(idx, 'name', e.target.value)} placeholder="Practitioner name"
                              className="w-full border border-gray-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">License Type *</label>
                            <select value={lic.licenseType} onChange={e => updateLicense(idx, 'licenseType', e.target.value)}
                              className="w-full border border-gray-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand">
                              <option value="">Select type...</option>
                              {LICENSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">PRC License Number</label>
                            <input type="text" value={lic.prcNumber ?? ''} onChange={e => updateLicense(idx, 'prcNumber', e.target.value)} placeholder="PRC no."
                              className="w-full border border-gray-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">PTR Number</label>
                            <input type="text" value={lic.ptrNumber ?? ''} onChange={e => updateLicense(idx, 'ptrNumber', e.target.value)} placeholder="PTR no."
                              className="w-full border border-gray-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">License Expiry</label>
                            <input type="date" value={lic.licenseExpiry?.split('T')[0] ?? ''} onChange={e => updateLicense(idx, 'licenseExpiry', e.target.value)}
                              className="w-full border border-gray-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand" />
                            <ExpiryWarning dateStr={lic.licenseExpiry} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
