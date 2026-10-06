'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { showToast } from '@/lib/toast';
import { usePermissions } from '@/hooks/usePermissions';
import { getDictionaryClient } from '../../dictionaries-client';

interface RetailCompliance {
  dtiBusinessNameRegistration?: string;
  priceTaggingCompliant?: boolean;
  weightsAndMeasuresCompliant?: boolean;
  btiAccreditation?: string;
  productLabelsCompliant?: boolean;
}

const INPUT = 'w-full border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900 font-mono disabled:bg-gray-100';
const LABEL = 'block text-xs font-medium text-gray-600 mb-1';

function SectionCard({ title, suffix, description, children }: {
  title: string;
  suffix?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-gray-300">
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

function CheckRow({ checked, onChange, label, description }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="checkbox-win8 mt-0.5"
      />
      <span>
        <span className="block text-sm font-medium text-gray-700">{label}</span>
        <span className="block text-xs text-gray-500 mt-0.5">{description}</span>
      </span>
    </label>
  );
}

export default function RetailCompliancePage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { canAccess } = usePermissions();
  const canManage = canAccess('retail_compliance.manage');

  const [data, setData] = useState<RetailCompliance>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDictionaryClient(lang as 'en' | 'es').then(setDict);
  }, [lang]);

  const fetchData = useCallback(async () => {
    const failMsg = dict?.admin?.failedToLoadRetailCompliance || 'Failed to load retail compliance';
    try {
      const res = await fetch(`/api/tenants/${tenant}/retail-compliance`);
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

  const set = (key: keyof RetailCompliance) => (v: unknown) => setData(d => ({ ...d, [key]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenant}/retail-compliance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) showToast.success(dict?.admin?.retailComplianceSaved || 'Retail compliance settings saved');
      else showToast.error(json.error || dict?.admin?.failedToSave || 'Failed to save');
    } catch { showToast.error(dict?.admin?.failedToSave || 'Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <div className="px-4 sm:px-6 py-6">
      <AdminPageHeader
        title={dict?.admin?.retailComplianceTitle || 'Retail Store Compliance'}
        description={dict?.admin?.retailComplianceSubtitle || 'RA 7394 Consumer Act of the Philippines — DTI and consumer protection'}
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
            <p className="mt-3 text-gray-400 text-sm">{dict?.admin?.loadingRetailCompliance || 'Loading retail compliance…'}</p>
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
                    dict?.admin?.retailRequirementDti || 'DTI Business Name Registration (RA 3883)',
                    dict?.admin?.retailRequirementPriceTagging || 'Price Tagging Compliance (DTI)',
                    dict?.admin?.retailRequirementWeightsMeasures || 'Weights & Measures (DOST-MSSM)',
                    dict?.admin?.retailRequirementProductLabels || 'Product Labels (RA 7394)',
                    dict?.admin?.retailRequirementBti || 'BTI Accreditation (importers/exporters)',
                  ].map(item => (
                    <li key={item} className="flex gap-2">
                      <span className="inline-block w-1.5 h-1.5 bg-brand shrink-0 mt-1" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
                <hr className="border-gray-200 my-3" />
                <p className="text-xs text-gray-500">{dict?.admin?.retailExpiryNote || 'Ensure all consumer protection requirements are met before operating your retail store.'}</p>
              </div>
            </aside>

            {/* Right — form sections */}
            <fieldset disabled={!canManage} className="w-full flex-1 min-w-0 space-y-6">

              {/* DTI Registration */}
              <SectionCard
                title={dict?.admin?.dtiRegistrationSectionTitle || 'DTI Business Name Registration'}
                description={dict?.admin?.dtiRegistrationSectionDesc || 'Required for sole proprietors under RA 3883. Corporations register with SEC instead.'}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="rc-dti" className={LABEL}>{dict?.admin?.registrationNumber || 'Registration Number'}</label>
                    <input
                      id="rc-dti"
                      type="text"
                      value={data.dtiBusinessNameRegistration ?? ''}
                      onChange={e => set('dtiBusinessNameRegistration')(e.target.value)}
                      placeholder={dict?.admin?.registrationNumberPlaceholder || 'e.g. BN202400000001'}
                      className={INPUT}
                    />
                  </div>
                </div>
              </SectionCard>

              {/* Consumer Act Compliance */}
              <SectionCard
                title={dict?.admin?.consumerActComplianceTitle || 'Consumer Act Compliance (RA 7394)'}
                description={dict?.admin?.consumerActComplianceDesc || 'Requirements for retail stores selling directly to consumers.'}
              >
                <div className="space-y-4">
                  <CheckRow
                    checked={data.priceTaggingCompliant ?? false}
                    onChange={set('priceTaggingCompliant')}
                    label={dict?.admin?.priceTaggingCompliant || 'Price Tagging Compliant'}
                    description={dict?.admin?.priceTaggingCompliantDesc || 'All products have visible price tags or shelf prices per DTI price tag law'}
                  />
                  <CheckRow
                    checked={data.weightsAndMeasuresCompliant ?? false}
                    onChange={set('weightsAndMeasuresCompliant')}
                    label={dict?.admin?.weightsAndMeasuresCompliant || 'Weights & Measures Compliant'}
                    description={dict?.admin?.weightsAndMeasuresCompliantDesc || 'Weighing and measuring devices are calibrated and stamped by DOST-MSSM'}
                  />
                  <CheckRow
                    checked={data.productLabelsCompliant ?? false}
                    onChange={set('productLabelsCompliant')}
                    label={dict?.admin?.productLabelsCompliant || 'Product Labels Compliant'}
                    description={dict?.admin?.productLabelsCompliantDesc || 'All product labels include mandatory information (contents, manufacturer, country of origin)'}
                  />
                </div>
              </SectionCard>

              {/* BTI Accreditation */}
              <SectionCard
                title={dict?.admin?.btiAccreditationSectionTitle || 'BTI Accreditation'}
                suffix={dict?.admin?.btiAccreditationOptional || '(Optional)'}
                description={dict?.admin?.btiAccreditationSectionDesc || 'Bureau of Trade and Industry accreditation for importers or exporters.'}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="rc-bti" className={LABEL}>{dict?.admin?.accreditationNumber || 'Accreditation Number'}</label>
                    <input
                      id="rc-bti"
                      type="text"
                      value={data.btiAccreditation ?? ''}
                      onChange={e => set('btiAccreditation')(e.target.value)}
                      placeholder={dict?.admin?.accreditationNumberPlaceholder || 'BTI accreditation number (if applicable)'}
                      className={INPUT}
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
