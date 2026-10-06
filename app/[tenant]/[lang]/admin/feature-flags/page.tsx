'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getBusinessTypeConfig } from '@/lib/business-types';
import { getBusinessType } from '@/lib/business-type-helpers';
import { usePermissions } from '@/hooks/usePermissions';
import { useFeatureFlagsSettings } from '@/hooks/useFeatureFlagsSettings';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import {
  getSaveSuccessMessage,
  getSaveErrorMessage,
  getFeatureFlagLabel,
  getFeatureFlagDescription,
  FEATURE_FLAGS,
} from '@/lib/feature-flags-helpers';

export default function FeatureFlagsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { settings: tenantSettings } = useTenantSettings();
  const businessTypeConfig = tenantSettings ? getBusinessTypeConfig(getBusinessType(tenantSettings)) : null;
  const { canAccess } = usePermissions();
  const canManage = canAccess('feature_flags.manage');

  const { settings, loading, saving, message, setMessage, fetchSettings, updateSetting, saveSettings } =
    useFeatureFlagsSettings(tenant);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchSettings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, tenant]);

  const handleSave = async () => {
    if (!settings || !dict) return;

    const result = await saveSettings(settings);
    if (result.success) {
      setMessage({ type: 'success', text: getSaveSuccessMessage(dict) });
      setTimeout(() => setMessage(null), 3000);
    } else {
      setMessage({ type: 'error', text: result.error || getSaveErrorMessage(dict) });
    }
  };

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  // useFeatureFlagsSettings resolves null/missing flags to the business-type default.
  const isEnabled = (flagKey: string) => (settings as any)?.[flagKey] === true; // eslint-disable-line @typescript-eslint/no-explicit-any
  const enabledCount = settings ? FEATURE_FLAGS.filter(isEnabled).length : 0;

  return (
    <div className="px-4 sm:px-6 py-6">
      <AdminPageHeader
        title={dict?.admin?.featureFlags || 'Feature Flags'}
        description={dict?.admin?.featureFlagsSubtitle || 'Enable or disable system-wide features. Changes affect the entire application.'}
      />

      <div className="space-y-6">
        {loading ? (
          <div className="text-center py-12 bg-white border border-gray-300">
            <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
            <p className="mt-3 text-gray-400 text-sm">{dict?.admin?.loadingFeatureFlags || 'Loading feature flags…'}</p>
          </div>
        ) : !settings ? (
          <div className="text-center py-12 bg-white border border-gray-300 px-4">
            <p className="text-sm font-bold text-gray-900">{dict?.common?.failedToLoadSettingsTitle || 'Failed to Load Settings'}</p>
            <p className="mt-1 text-win8-danger text-sm font-medium">
              {message?.text || dict?.common?.unableToLoadSettings || 'Unable to load tenant settings. Please check your connection and try again.'}
            </p>
            <button
              onClick={() => fetchSettings()}
              className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
            >
              {dict?.common?.retry || 'Retry'}
            </button>
          </div>
        ) : (
          <>
            {businessTypeConfig && (
              <div className="bg-brand-soft border border-brand p-4 text-sm text-brand-navy">
                <p className="font-semibold">
                  {(dict?.admin?.currentBusinessTypeLabel || 'Current Business Type: {name}').replace('{name}', businessTypeConfig.name)}
                </p>
                <p className="mt-1">{businessTypeConfig.description}</p>
                <p className="mt-1 text-xs">
                  {dict?.admin?.businessTypeAutoConfiguredNote || 'Default features for this business type are auto-configured. You can override them below.'}
                </p>
              </div>
            )}

            {!canManage && (
              <div className="bg-brand-soft border border-brand p-4 text-sm text-brand-navy">
                {dict?.settings?.readOnlyNotice || "You don't have permission to change settings. Contact an admin or manager."}
              </div>
            )}

            <section className="bg-white border border-gray-300">
              <div className="px-6 py-4 border-b border-gray-300 flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-base font-bold text-gray-900">{dict?.admin?.systemFeatures || 'System Features'}</h2>
                <span className="px-2 py-0.5 text-xs font-semibold bg-brand-navy text-white tabular-nums">
                  {(dict?.admin?.featuresEnabledCount || '{enabled} of {total} enabled')
                    .replace('{enabled}', String(enabledCount))
                    .replace('{total}', String(FEATURE_FLAGS.length))}
                </span>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                {FEATURE_FLAGS.map((flagKey) => {
                  const isChecked = isEnabled(flagKey);
                  const description = getFeatureFlagDescription(flagKey, dict);
                  return (
                    <label
                      key={flagKey}
                      htmlFor={flagKey}
                      className={`flex items-start gap-3 p-4 border transition-colors ${
                        isChecked ? 'border-brand bg-brand-soft' : 'border-gray-300 bg-white'
                      } ${canManage ? 'cursor-pointer hover:border-brand' : 'cursor-not-allowed'}`}
                    >
                      <input
                        type="checkbox"
                        id={flagKey}
                        checked={isChecked}
                        disabled={!canManage}
                        onChange={(e) => updateSetting(flagKey, e.target.checked)}
                        className="checkbox-win8 mt-0.5 shrink-0 disabled:opacity-50"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-gray-900">
                          {getFeatureFlagLabel(flagKey, dict)}
                        </span>
                        {description && (
                          <span className="block text-xs text-gray-500 mt-0.5 leading-snug">{description}</span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>

            {(canManage || message) && (
              <div className="flex items-center justify-end gap-4 flex-wrap">
                {message && (
                  <p
                    role={message.type === 'error' ? 'alert' : 'status'}
                    className={`mr-auto text-sm font-medium ${message.type === 'success' ? 'text-win8-success' : 'text-win8-danger'}`}
                  >
                    {message.text}
                  </p>
                )}
                {canManage && (
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
                  >
                    {saving ? (dict?.settings?.saving || 'Saving…') : (dict?.admin?.saveFeatureFlags || 'Save Feature Flags')}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
