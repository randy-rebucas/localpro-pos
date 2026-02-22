'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../dictionaries-client';
import { ITenantSettings } from '@/models/Tenant';

export default function AdvancedBrandingPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<ITenantSettings | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchSettings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, tenant]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/tenants/${tenant}/settings`);
      const data = await res.json();
      if (data.success) {
        setSettings(data.data);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to load settings' });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      setMessage({ type: 'error', text: 'Failed to load settings. Please check your connection.' });
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = (path: string, value: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!settings) return;
    
    const keys = path.split('.');
    const newSettings = JSON.parse(JSON.stringify(settings));
    let current: any = newSettings; // eslint-disable-line @typescript-eslint/no-explicit-any
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
    setSettings(newSettings);
  };

  const handleSave = async () => {
    if (!settings) return;

    try {
      setSaving(true);
      setMessage(null);
      const res = await fetch(`/api/tenants/${tenant}/settings`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ settings }),
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: dict?.admin?.advancedBrandingSaved || 'Advanced branding settings saved successfully!' });
        setSettings(data.data);
        setTimeout(() => setMessage(null), 3000);
      } else {
        if (res.status === 401 || res.status === 403) {
          setMessage({ type: 'error', text: dict?.settings?.unauthorized || 'Unauthorized. Please login with admin account.' });
        } else {
          setMessage({ type: 'error', text: data.error || dict?.admin?.failedToSaveAdvancedBranding || 'Failed to save settings' });
        }
      }
    } catch (error) {
      console.error('Error saving advanced branding settings:', error);
      setMessage({ type: 'error', text: dict?.admin?.failedToSaveAdvancedBrandingConnection || 'Failed to save settings. Please check your connection.' });
    } finally {
      setSaving(false);
    }
  };

  if (!dict || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="bg-red-50 border-2 border-red-300 p-5 sm:p-6">
            <h2 className="text-xl font-bold text-red-800 mb-2">{dict?.settings?.failedToLoad || 'Failed to Load Settings'}</h2>
            <p className="text-red-700 mb-4">
              {message?.text || 'Unable to load tenant settings. Please check your connection and try again.'}
            </p>
            <button
              onClick={fetchSettings}
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
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6">
          <Link
            href={`/${tenant}/${lang}/admin`}
            className="text-blue-600 hover:text-blue-700 font-medium mb-4 inline-flex items-center"
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {dict?.common?.back || 'Back'} to Admin
          </Link>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
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
                  className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                >
                  <option value="system">{dict?.admin?.systemFont || 'System Font'}</option>
                  <option value="google">{dict?.admin?.googleFont || 'Google Font'}</option>
                  <option value="custom">{dict?.admin?.customFont || 'Custom Font'}</option>
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
                  className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                  placeholder={dict?.admin?.fontFamilyPlaceholder || 'e.g., Roboto, Inter, Arial'}
                />
              </div>
              {settings.advancedBranding?.fontSource === 'google' && (
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
                    className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                    placeholder={dict?.admin?.googleFontURLPlaceholder || 'https://fonts.googleapis.com/css2?family=Roboto'}
                  />
                </div>
              )}
              {settings.advancedBranding?.fontSource === 'custom' && (
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
                    className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                    placeholder={dict?.admin?.customFontURLPlaceholder || 'https://example.com/fonts/custom-font.woff2'}
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.admin?.theme || 'Theme'}
                </label>
                <select
                  value={settings.advancedBranding?.theme || 'light'}
                  onChange={(e) => updateSetting('advancedBranding', {
                    ...settings.advancedBranding,
                    theme: e.target.value as 'light' | 'dark' | 'auto' | 'custom',
                  })}
                  className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                >
                  <option value="light">{dict?.admin?.light || 'Light'}</option>
                  <option value="dark">{dict?.admin?.dark || 'Dark'}</option>
                  <option value="auto">{dict?.admin?.autoSystem || 'Auto (System)'}</option>
                  <option value="custom">{dict?.admin?.custom || 'Custom'}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.admin?.borderRadius || 'Border Radius'}
                </label>
                <select
                  value={settings.advancedBranding?.borderRadius || 'md'}
                  onChange={(e) => updateSetting('advancedBranding', {
                    ...settings.advancedBranding,
                    borderRadius: e.target.value as 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'custom',
                  })}
                  className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                >
                  <option value="none">{dict?.admin?.none || 'None'}</option>
                  <option value="sm">{dict?.admin?.small || 'Small'}</option>
                  <option value="md">{dict?.admin?.medium || 'Medium'}</option>
                  <option value="lg">{dict?.admin?.large || 'Large'}</option>
                  <option value="xl">{dict?.admin?.extraLarge || 'Extra Large'}</option>
                  <option value="custom">{dict?.admin?.custom || 'Custom'}</option>
                </select>
              </div>
              {settings.advancedBranding?.borderRadius === 'custom' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {dict?.admin?.customBorderRadius || 'Custom Border Radius'}
                  </label>
                  <input
                    type="text"
                    value={settings.advancedBranding?.customBorderRadius || ''}
                    onChange={(e) => updateSetting('advancedBranding', {
                      ...settings.advancedBranding,
                      customBorderRadius: e.target.value,
                    })}
                    className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                    placeholder={dict?.admin?.customBorderRadiusPlaceholder || 'e.g., 8px, 0.5rem, 12px 8px'}
                  />
                </div>
              )}
              {settings.advancedBranding?.theme === 'custom' && (
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
                    className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white font-mono text-sm"
                    placeholder={dict?.admin?.customCSSPlaceholder || ':root { --primary-color: #2563eb; }'}
                  />
                  <p className="mt-2 text-xs text-gray-500">
                    {dict?.admin?.customCSSHint || 'Add custom CSS variables or styles. Use CSS variables for better theme integration.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-6 mt-8 border-t border-gray-200">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-3 bg-blue-600 text-white hover:bg-blue-700 font-semibold transition-all duration-200 border border-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
        </div>
      </div>
    </div>
  );
}
