'use client';

import React, { useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { useBrandingSettings } from '@/hooks/useBrandingSettings';
import { useBrandingSave } from '@/hooks/useBrandingSave';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { showToast } from '@/lib/toast';
import {
  getFontSourceOptions,
  shouldShowGoogleFontUrl,
  shouldShowCustomFontUrl,
  getPlaceholderForFontFamily,
  getPlaceholderForGoogleFontUrl,
  getPlaceholderForCustomFontUrl,
  getPlaceholderForCustomCSS,
  getCustomCSSHint,
  validateCustomCSS,
} from '@/lib/branding-helpers';

// Matches the https-only check the settings PUT route now enforces for
// googleFontUrl/customFontUrl (see app/api/tenants/[slug]/settings/route.ts) —
// both get rendered into a <link href>/@font-face src: url(...) app-wide
// (contexts/TenantSettingsContext.tsx), same injection surface as `logo`.
const SAFE_URL_RE = /^https:\/\/[^\s"'<>]+$/i;
import { usePermissions } from '@/hooks/usePermissions';

const INPUT = 'w-full border border-gray-300 px-3 py-2 text-sm bg-white disabled:bg-gray-100';
const LABEL = 'block text-xs font-medium text-gray-600 mb-1';

export default function AdvancedBrandingPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = React.useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { canAccess } = usePermissions();
  const canManage = canAccess('branding.manage');

  const { settings, loading, error, fetchSettings, updateSetting } = useBrandingSettings(tenant);
  const { saving, save } = useBrandingSave(tenant);

  // Load dictionary
  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  // Load settings on mount
  useEffect(() => {
    if (tenant) {
      fetchSettings((error) => {
        showToast.error(error);
      });
    }
  }, [tenant, fetchSettings]);

  const handleSave = useCallback(async () => {
    if (!settings) return;

    const branding = settings.advancedBranding;
    if (branding?.googleFontUrl && !SAFE_URL_RE.test(branding.googleFontUrl)) {
      showToast.error(dict?.validation?.invalidFontUrl || 'Google Font URL must be a valid https:// address');
      return false;
    }
    if (branding?.customFontUrl && !SAFE_URL_RE.test(branding.customFontUrl)) {
      showToast.error(dict?.validation?.invalidFontUrl || 'Custom Font URL must be a valid https:// address');
      return false;
    }
    if (branding?.customThemeCss) {
      const cssCheck = validateCustomCSS(branding.customThemeCss);
      if (!cssCheck.valid) {
        showToast.error(cssCheck.errors[0]);
        return false;
      }
    }

    const success = await save(settings, () => {
      showToast.success(dict?.admin?.advancedBrandingSaved || 'Advanced branding settings saved successfully!');
    }, (error) => {
      showToast.error(error);
    });

    return success;
  }, [settings, save, dict]);

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-6">
      <AdminPageHeader
        title={dict?.admin?.advancedBranding || 'Advanced Branding'}
        description={dict?.admin?.advancedBrandingDescription || 'Customize fonts, themes, and CSS for advanced branding control'}
      />

      <div className="space-y-6">
        {loading ? (
          <div className="text-center py-12 bg-white border border-gray-300">
            <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
            <p className="mt-3 text-gray-400 text-sm">{dict?.admin?.loadingAdvancedBranding || 'Loading advanced branding…'}</p>
          </div>
        ) : !settings ? (
          <div className="text-center py-12 bg-white border border-gray-300 px-4">
            <p className="text-sm font-bold text-gray-900">{dict?.settings?.failedToLoad || 'Failed to Load Settings'}</p>
            <p className="mt-1 text-win8-danger text-sm font-medium">
              {error || dict?.settings?.loadErrorDescription || 'Unable to load tenant settings. Please check your connection and try again.'}
            </p>
            <button
              onClick={() => fetchSettings()}
              className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
            >
              {dict?.settings?.retry || 'Retry'}
            </button>
          </div>
        ) : (
          <>
            {!canManage && (
              <div className="bg-brand-soft border border-brand p-4 text-sm text-brand-navy">
                {dict?.settings?.readOnlyNotice || "You don't have permission to change settings. Contact an admin or manager."}
              </div>
            )}

            <fieldset disabled={!canManage} className="space-y-6">
              <section className="bg-white border border-gray-300">
                <div className="px-6 py-4 border-b border-gray-300">
                  <h2 className="text-base font-bold text-gray-900">{dict?.admin?.typography || 'Typography'}</h2>
                  <p className="text-sm text-gray-500">
                    {dict?.admin?.typographyDescription || 'Choose the font source and family used across the app'}
                  </p>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="ab-font-source" className={LABEL}>
                      {dict?.admin?.fontSource || 'Font Source'}
                    </label>
                    <select
                      id="ab-font-source"
                      value={settings.advancedBranding?.fontSource || 'system'}
                      onChange={(e) => {
                        const fontSource = e.target.value as 'google' | 'custom' | 'system';
                        updateSetting('advancedBranding', {
                          ...settings.advancedBranding,
                          fontSource,
                        });
                      }}
                      className={INPUT}
                    >
                      {getFontSourceOptions().map((option) => (
                        <option key={option.value} value={option.value}>
                          {dict?.admin?.[option.value === 'system' ? 'systemFont' : option.value === 'google' ? 'googleFont' : 'customFont'] || option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="ab-font-family" className={LABEL}>
                      {dict?.admin?.fontFamilyName || 'Font Family Name'}
                    </label>
                    <input
                      id="ab-font-family"
                      type="text"
                      value={settings.advancedBranding?.fontFamily || ''}
                      onChange={(e) => updateSetting('advancedBranding', {
                        ...settings.advancedBranding,
                        fontFamily: e.target.value,
                      })}
                      className={INPUT}
                      placeholder={getPlaceholderForFontFamily(dict)}
                    />
                  </div>
                  {shouldShowGoogleFontUrl(settings.advancedBranding?.fontSource) && (
                    <div className="md:col-span-2">
                      <label htmlFor="ab-google-font-url" className={LABEL}>
                        {dict?.admin?.googleFontURL || 'Google Font URL'}
                      </label>
                      <input
                        id="ab-google-font-url"
                        type="url"
                        value={settings.advancedBranding?.googleFontUrl || ''}
                        onChange={(e) => updateSetting('advancedBranding', {
                          ...settings.advancedBranding,
                          googleFontUrl: e.target.value,
                        })}
                        className={`${INPUT} font-mono`}
                        placeholder={getPlaceholderForGoogleFontUrl(dict)}
                      />
                    </div>
                  )}
                  {shouldShowCustomFontUrl(settings.advancedBranding?.fontSource) && (
                    <div className="md:col-span-2">
                      <label htmlFor="ab-custom-font-url" className={LABEL}>
                        {dict?.admin?.customFontURL || 'Custom Font URL'}
                      </label>
                      <input
                        id="ab-custom-font-url"
                        type="url"
                        value={settings.advancedBranding?.customFontUrl || ''}
                        onChange={(e) => updateSetting('advancedBranding', {
                          ...settings.advancedBranding,
                          customFontUrl: e.target.value,
                        })}
                        className={`${INPUT} font-mono`}
                        placeholder={getPlaceholderForCustomFontUrl(dict)}
                      />
                    </div>
                  )}
                </div>
              </section>

              <section className="bg-white border border-gray-300">
                <div className="px-6 py-4 border-b border-gray-300">
                  <h2 className="text-base font-bold text-gray-900">{dict?.admin?.customCSS || 'Custom CSS'}</h2>
                  <p className="text-sm text-gray-500">
                    {dict?.admin?.customCSSDescription || 'Theme overrides applied on top of your branding'}
                  </p>
                </div>
                <div className="p-6">
                  <label htmlFor="ab-custom-css" className="sr-only">
                    {dict?.admin?.customCSS || 'Custom CSS'}
                  </label>
                  <textarea
                    id="ab-custom-css"
                    value={settings.advancedBranding?.customThemeCss || ''}
                    onChange={(e) => updateSetting('advancedBranding', {
                      ...settings.advancedBranding,
                      customThemeCss: e.target.value,
                    })}
                    rows={12}
                    spellCheck={false}
                    className={`${INPUT} font-mono text-xs`}
                    placeholder={getPlaceholderForCustomCSS(dict)}
                  />
                  <p className="text-xs text-gray-400 mt-1">{getCustomCSSHint(dict)}</p>
                </div>
              </section>
            </fieldset>

            {canManage && (
              <div className="flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
                >
                  {saving ? (dict?.settings?.saving || 'Saving…') : (dict?.settings?.save || 'Save Settings')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
