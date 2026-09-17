'use client';

import React, { useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../dictionaries-client';
import { useBrandingSettings } from '@/hooks/useBrandingSettings';
import { useBrandingSave } from '@/hooks/useBrandingSave';
import {
  getFontSourceOptions,
  shouldShowGoogleFontUrl,
  shouldShowCustomFontUrl,
  getPlaceholderForFontFamily,
  getPlaceholderForGoogleFontUrl,
  getPlaceholderForCustomFontUrl,
  getPlaceholderForCustomCSS,
  getCustomCSSHint,
} from '@/lib/branding-helpers';
import toast from 'react-hot-toast';
import { usePermissions } from '@/hooks/usePermissions';

export default function AdvancedBrandingPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = React.useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { canAccess } = usePermissions();
  const canManage = canAccess('settings.manage');

  const { settings, loading, error, fetchSettings, updateSetting } = useBrandingSettings(tenant);
  const { saving, message, save } = useBrandingSave(tenant);

  // Load dictionary
  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  // Load settings on mount
  useEffect(() => {
    if (tenant) {
      fetchSettings((error) => {
        toast.error(error);
      });
    }
  }, [tenant, fetchSettings]);

  const handleSave = useCallback(async () => {
    if (!settings) return;

    const success = await save(settings, () => {
      toast.success(dict?.admin?.advancedBrandingSaved || 'Advanced branding settings saved successfully!');
    }, (error) => {
      toast.error(error);
    });

    return success;
  }, [settings, save, dict]);

  if (!dict || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-brand"></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div>
        <div className="px-4 sm:px-6 py-6">
          <div className="bg-red-50 border-2 border-red-300 p-5 sm:p-6">
            <h2 className="text-xl font-bold text-red-800 mb-2">{dict?.settings?.failedToLoad || 'Failed to Load Settings'}</h2>
            <p className="text-red-700 mb-4">
              {error || 'Unable to load tenant settings. Please check your connection and try again.'}
            </p>
            <button
              onClick={() => fetchSettings()}
              className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 font-medium transition-colors border border-red-700"
            >
              {dict?.settings?.retry || 'Retry'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="px-4 sm:px-6 py-6">
        <div className="mb-6">
          <Link
            href={`/${tenant}/${lang}/admin`}
            className="text-brand hover:text-brand-hover font-medium mb-4 inline-flex items-center"
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {dict?.admin?.backToAdmin || 'Back to Admin'}
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {dict?.admin?.advancedBranding || 'Advanced Branding'}
          </h1>
          <p className="text-gray-600">
            {dict?.admin?.advancedBrandingDescription || 'Customize fonts, themes, and CSS for advanced branding control'}
          </p>
        </div>

        {message && (
          <div
            className={`mb-6 p-4 border ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800 border-green-300'
                : 'bg-red-50 text-red-800 border-red-300'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="bg-white border border-gray-300 p-6 space-y-8">
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-5">
              {dict?.settings?.advancedBranding || 'Advanced Branding'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.admin?.fontSource || 'Font Source'}
                </label>
                <select
                  value={settings.advancedBranding?.fontSource || 'system'}
                  onChange={(e) => {
                    const fontSource = e.target.value as 'google' | 'custom' | 'system';
                    updateSetting('advancedBranding', {
                      ...settings.advancedBranding,
                      fontSource,
                    });
                  }}
                  className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                >
                  {getFontSourceOptions().map((option) => (
                    <option key={option.value} value={option.value}>
                      {dict?.admin?.[option.value === 'system' ? 'systemFont' : option.value === 'google' ? 'googleFont' : 'customFont'] || option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.admin?.fontFamilyName || 'Font Family Name'}
                </label>
                <input
                  type="text"
                  value={settings.advancedBranding?.fontFamily || ''}
                  onChange={(e) => updateSetting('advancedBranding', {
                    ...settings.advancedBranding,
                    fontFamily: e.target.value,
                  })}
                  className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                  placeholder={getPlaceholderForFontFamily(dict)}
                />
              </div>
              {shouldShowGoogleFontUrl(settings.advancedBranding?.fontSource) && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {dict?.admin?.googleFontURL || 'Google Font URL'}
                  </label>
                  <input
                    type="url"
                    value={settings.advancedBranding?.googleFontUrl || ''}
                    onChange={(e) => updateSetting('advancedBranding', {
                      ...settings.advancedBranding,
                      googleFontUrl: e.target.value,
                    })}
                    className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                    placeholder={getPlaceholderForGoogleFontUrl(dict)}
                  />
                </div>
              )}
              {shouldShowCustomFontUrl(settings.advancedBranding?.fontSource) && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {dict?.admin?.customFontURL || 'Custom Font URL'}
                  </label>
                  <input
                    type="url"
                    value={settings.advancedBranding?.customFontUrl || ''}
                    onChange={(e) => updateSetting('advancedBranding', {
                      ...settings.advancedBranding,
                      customFontUrl: e.target.value,
                    })}
                    className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                    placeholder={getPlaceholderForCustomFontUrl(dict)}
                  />
                </div>
              )}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.admin?.customCSS || 'Custom CSS'}
                </label>
                <textarea
                  value={settings.advancedBranding?.customTheme?.css || ''}
                  onChange={(e) => updateSetting('advancedBranding', {
                    ...settings.advancedBranding,
                    customTheme: {
                      ...settings.advancedBranding?.customTheme,
                      css: e.target.value,
                    },
                  })}
                  rows={10}
                  className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white font-mono text-sm"
                  placeholder={getPlaceholderForCustomCSS(dict)}
                />
                <p className="mt-2 text-xs text-gray-500">
                  {getCustomCSSHint(dict)}
                </p>
              </div>
            </div>
          </div>

          {canManage && (
            <div className="flex justify-end pt-6 mt-8 border-t border-gray-200">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-3 bg-brand text-white hover:bg-brand-hover font-semibold transition-all duration-200 border border-brand-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="animate-spin h-5 w-5 border-b-2 border-white"></div>
                    <span>{dict?.common?.saving || 'Saving...'}</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{dict?.common?.save || 'Save Settings'}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
