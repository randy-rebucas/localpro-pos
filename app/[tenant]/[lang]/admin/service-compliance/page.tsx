'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Trash2, AlertTriangle } from 'lucide-react';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { showToast } from '@/lib/toast';
import { usePermissions } from '@/hooks/usePermissions';
import { getDictionaryClient } from '../../dictionaries-client';

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

function ExpiryWarning({ dateStr, dict }: { dateStr?: string; dict?: any }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!dateStr) return null;
  const days = daysUntil(dateStr);
  if (days > 30) return null;
  const expired = days < 0;
  const label = expired
    ? (dict?.serviceCompliance?.expiredDaysAgo || 'Expired {count} day(s) ago').replace('{count}', String(Math.abs(days)))
    : (dict?.serviceCompliance?.expiresInDays || 'Expires in {count} day(s)').replace('{count}', String(days));
  return (
    <p className={`flex items-center gap-1 text-xs mt-1 font-semibold ${expired ? 'text-win8-danger' : 'text-win8-warning'}`}>
      <AlertTriangle className="w-3 h-3" aria-hidden="true" />
      {label}
    </p>
  );
}

const BLANK_LICENSE: PractitionerLicense = { name: '', licenseType: '', prcNumber: '', ptrNumber: '', licenseExpiry: '' };

export default function ServiceCompliancePage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;

  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<ServiceCompliance>({ practitionerLicenses: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { canAccess } = usePermissions();
  const canManage = canAccess('service_compliance.manage');

  useEffect(() => {
    getDictionaryClient(lang as 'en' | 'es').then(setDict);
  }, [lang]);

  const fetchData = useCallback(async () => {
    const failMsg = dict?.serviceCompliance?.loadFailed || 'Failed to load service compliance';
    try {
      const res = await fetch(`/api/tenants/${tenant}/service-compliance`);
      const json = await res.json();
      if (json.success) {
        setData({ practitionerLicenses: [], ...json.data });
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

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenant}/service-compliance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) showToast.success(dict?.serviceCompliance?.saveSuccess || 'Service compliance settings saved');
      else showToast.error(json.error || dict?.serviceCompliance?.saveFailed || 'Failed to save');
    } catch { showToast.error(dict?.serviceCompliance?.saveFailed || 'Failed to save'); }
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
  const removeLicense = (idx: number) => {
    const lic = (data.practitionerLicenses ?? [])[idx];
    // A freshly added, still-empty row has nothing to lose — skip the prompt.
    const hasContent = lic && Object.values(lic).some(v => typeof v === 'string' && v.trim() !== '');
    if (hasContent) {
      const name = lic.name.trim() || dict?.serviceCompliance?.unnamedPractitioner || 'Unnamed practitioner';
      const msg = (dict?.serviceCompliance?.confirmRemoveLicense || 'Remove the license for "{name}"? The change takes effect when you save.').replace('{name}', name);
      if (!confirm(msg)) return;
    }
    setData(d => ({ ...d, practitionerLicenses: (d.practitionerLicenses ?? []).filter((_, i) => i !== idx) }));
  };

  const LICENSE_TYPES = ['Beautician', 'Cosmetologist', 'Massage Therapist', 'Barber', 'Manicurist', 'Pedicurist', 'Aesthetician', 'Physical Therapist', 'Occupational Therapist', 'Nutritionist-Dietitian', 'Other'];
  const licenses = data.practitionerLicenses ?? [];

  return (
    <div className="px-4 sm:px-6 py-6">
      <AdminPageHeader
        title={dict?.serviceCompliance?.title || 'Service Business Compliance'}
        description={dict?.serviceCompliance?.subtitle || 'DOH accreditation and PRC practitioner licenses for service businesses'}
        actions={
          <>
            <Link
              href={`/${tenant}/${lang}/admin/compliance`}
              className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
            >
              {dict?.serviceCompliance?.complianceStatus || 'Compliance Status'}
            </Link>
            {canManage && (
              <button
                onClick={handleSave}
                disabled={saving || loading || !!loadError}
                className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
              >
                {saving ? (dict?.common?.saving || 'Saving…') : (dict?.serviceCompliance?.saveSettings || 'Save Settings')}
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
            <p className="mt-3 text-gray-400 text-sm">{dict?.serviceCompliance?.loading || 'Loading compliance settings…'}</p>
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
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{dict?.serviceCompliance?.requirements || 'Requirements'}</p>
                <ul className="space-y-2 text-xs text-gray-700">
                  {[
                    dict?.serviceCompliance?.requirementDoh || 'DOH Accreditation (health-related services)',
                    dict?.serviceCompliance?.requirementPrc || 'PRC License per practitioner',
                    dict?.serviceCompliance?.requirementPtr || 'PTR (Professional Tax Receipt)',
                  ].map(item => (
                    <li key={item} className="flex gap-2">
                      <span className="inline-block w-1.5 h-1.5 bg-brand shrink-0 mt-1" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
                <hr className="border-gray-200 my-3" />
                <p className="text-xs text-gray-500">{dict?.serviceCompliance?.expiryHint || 'Set expiry dates to receive advance warnings before licenses lapse.'}</p>
              </div>
            </aside>

            {/* Right — form sections */}
            <fieldset disabled={!canManage} className="w-full flex-1 min-w-0 space-y-6">

              {/* DOH Accreditation */}
              <section className="bg-white border border-gray-300">
                <div className="px-6 py-4 border-b border-gray-300">
                  <h2 className="text-base font-bold text-gray-900">{dict?.serviceCompliance?.dohAccreditation || 'DOH Accreditation'}</h2>
                  <p className="text-sm text-gray-500">{dict?.serviceCompliance?.dohAccreditationDesc || 'Required for health-related service businesses (massage, spa, wellness centers, etc.)'}</p>
                </div>
                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="svc-doh" className={LABEL}>{dict?.serviceCompliance?.dohAccreditationNumber || 'DOH Accreditation Number'}</label>
                    <input id="svc-doh" type="text" value={data.dohAccreditation ?? ''} onChange={e => setData(d => ({ ...d, dohAccreditation: e.target.value }))} placeholder={dict?.serviceCompliance?.dohAccreditationNumberPlaceholder || 'DOH accreditation number'}
                      className={`${INPUT} font-mono`} />
                  </div>
                  <div>
                    <label htmlFor="svc-doh-expiry" className={LABEL}>{dict?.serviceCompliance?.accreditationExpiry || 'Accreditation Expiry'}</label>
                    <input id="svc-doh-expiry" type="date" value={data.dohAccreditationExpiry?.split('T')[0] ?? ''} onChange={e => setData(d => ({ ...d, dohAccreditationExpiry: e.target.value }))}
                      className={INPUT} />
                    <ExpiryWarning dateStr={data.dohAccreditationExpiry} dict={dict} />
                  </div>
                </div>
              </section>

              {/* Practitioner Licenses */}
              <section className="bg-white border border-gray-300">
                <div className="px-6 py-4 border-b border-gray-300 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">{dict?.serviceCompliance?.practitionerLicenses || 'Practitioner Licenses'}</h2>
                    <p className="text-sm text-gray-500">{dict?.serviceCompliance?.practitionerLicensesDesc || 'PRC licenses for all practitioners / professionals on staff'}</p>
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      onClick={addLicense}
                      className="shrink-0 px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors"
                    >
                      + {dict?.serviceCompliance?.add || 'Add'}
                    </button>
                  )}
                </div>
                <div className="p-6">
                  {licenses.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">{dict?.serviceCompliance?.noLicensesYet || 'No practitioner licenses added yet.'}</p>
                  ) : (
                    <div className="space-y-4">
                      {licenses.map((lic, idx) => (
                        <div key={idx} className="border border-gray-300">
                          <div className="flex items-center justify-between gap-3 pl-4 bg-gray-100 border-b border-gray-300">
                            <p className="text-sm font-semibold text-gray-900 truncate">
                              <span className="text-gray-500 tabular-nums mr-2">#{idx + 1}</span>
                              {lic.name.trim() || <span className="font-normal text-gray-400">—</span>}
                            </p>
                            {canManage && (
                              <button
                                type="button"
                                onClick={() => removeLicense(idx)}
                                title={dict?.serviceCompliance?.removeLicense || 'Remove license'}
                                aria-label={dict?.serviceCompliance?.removeLicense || 'Remove license'}
                                className="inline-flex items-center justify-center p-2.5 text-white bg-win8-danger hover:brightness-110 transition-[filter]"
                              >
                                <Trash2 className="w-4 h-4" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label htmlFor={`lic-${idx}-name`} className={LABEL}>{dict?.serviceCompliance?.fullName || 'Full Name *'}</label>
                              <input id={`lic-${idx}-name`} type="text" value={lic.name} onChange={e => updateLicense(idx, 'name', e.target.value)} placeholder={dict?.serviceCompliance?.practitionerNamePlaceholder || 'Practitioner name'}
                                className={INPUT} />
                            </div>
                            <div>
                              <label htmlFor={`lic-${idx}-type`} className={LABEL}>{dict?.serviceCompliance?.licenseType || 'License Type *'}</label>
                              <select id={`lic-${idx}-type`} value={lic.licenseType} onChange={e => updateLicense(idx, 'licenseType', e.target.value)}
                                className={INPUT}>
                                <option value="">{dict?.serviceCompliance?.selectType || 'Select type...'}</option>
                                {LICENSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>
                            <div>
                              <label htmlFor={`lic-${idx}-prc`} className={LABEL}>{dict?.serviceCompliance?.prcLicenseNumber || 'PRC License Number'}</label>
                              <input id={`lic-${idx}-prc`} type="text" value={lic.prcNumber ?? ''} onChange={e => updateLicense(idx, 'prcNumber', e.target.value)} placeholder={dict?.serviceCompliance?.prcNumberPlaceholder || 'PRC no.'}
                                className={`${INPUT} font-mono`} />
                            </div>
                            <div>
                              <label htmlFor={`lic-${idx}-ptr`} className={LABEL}>{dict?.serviceCompliance?.ptrNumber || 'PTR Number'}</label>
                              <input id={`lic-${idx}-ptr`} type="text" value={lic.ptrNumber ?? ''} onChange={e => updateLicense(idx, 'ptrNumber', e.target.value)} placeholder={dict?.serviceCompliance?.ptrNumberPlaceholder || 'PTR no.'}
                                className={`${INPUT} font-mono`} />
                            </div>
                            <div>
                              <label htmlFor={`lic-${idx}-expiry`} className={LABEL}>{dict?.serviceCompliance?.licenseExpiry || 'License Expiry'}</label>
                              <input id={`lic-${idx}-expiry`} type="date" value={lic.licenseExpiry?.split('T')[0] ?? ''} onChange={e => updateLicense(idx, 'licenseExpiry', e.target.value)}
                                className={INPUT} />
                              <ExpiryWarning dateStr={lic.licenseExpiry} dict={dict} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

            </fieldset>
          </div>
        )}
      </div>
    </div>
  );
}
