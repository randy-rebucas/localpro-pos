'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../dictionaries-client';
import { ITenantSettings } from '@/types/tenant';
import { detectLocation, getCurrencySymbolForCode } from '@/lib/location-detection';
import MultiCurrencyDisplaySettings from '@/components/settings/MultiCurrencyDisplaySettings';
import ReceiptTemplatesManager from '@/components/settings/ReceiptTemplatesManager';
import SettingsPageSkeleton from '@/components/settings/SettingsPageSkeleton';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import EcommerceIntegrationsSettings from '@/components/settings/EcommerceIntegrationsSettings';
import PageLoading from '@/components/ui/PageLoading';
import ErrorState from '@/components/ui/ErrorState';
import InlineBanner from '@/components/ui/InlineBanner';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useSettingsPage } from '@/hooks/useSettingsPage';
import type { TranslationDict } from '@/types/dictionary';

export default function SettingsPage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const { settings: tenantSettings } = useTenantSettings();
  const primaryColor = (tenantSettings || getDefaultTenantSettings()).primaryColor || '#35979c';
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const {
    settings,
    setSettings,
    status,
    error: settingsError,
    refetch,
    businessTypes,
    businessTypesStatus,
  } = useSettingsPage(tenant);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectedInfo, setDetectedInfo] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    'general' | 'branding' | 'contact' | 'receipt' | 'business' | 'notifications' | 'multiCurrency' | 'ecommerce'
  >('general');
  const [businessTypeWarning, setBusinessTypeWarning] = useState<string | null>(null);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab === 'ecommerce') {
      setActiveTab('ecommerce');
    }
  }, []);

  const autoDetectLocation = async () => {
    try {
      setDetecting(true);
      const detected = await detectLocation();
      
      if (!settings) return;
      
      // Update settings with detected values
      const newSettings = JSON.parse(JSON.stringify(settings));
      newSettings.timezone = detected.timezone;
      newSettings.currency = detected.currency;
      newSettings.currencySymbol = getCurrencySymbolForCode(detected.currency);
      newSettings.currencyPosition = detected.currencyPosition;
      newSettings.dateFormat = detected.dateFormat;
      newSettings.timeFormat = detected.timeFormat;
      newSettings.numberFormat = detected.numberFormat;
      
      setSettings(newSettings);
      setDetectedInfo(`Detected: ${detected.locale} (${detected.country || 'Unknown'}) - ${detected.currency} - ${detected.timezone}`);
      
      // Clear message after 5 seconds
      setTimeout(() => setDetectedInfo(null), 5000);
    } catch (error) {
      console.error('Error detecting location:', error);
      setMessage({
        type: 'error',
        text: dict?.settings?.failedToDetect || 'Failed to detect location. Please set manually.',
      });
    } finally {
      setDetecting(false);
    }
  };

  // Auto-detect location on first load if settings are default
  useEffect(() => {
    if (settings && status === 'ready' && !detecting) {
      const isDefault =
        settings.timezone === 'UTC' &&
        settings.currency === 'USD' &&
        settings.dateFormat === 'MM/DD/YYYY';

      if (isDefault) {
        autoDetectLocation();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, status]);

  const validateSettings = (): string | null => {
    if (!settings) return 'Settings not loaded';

    // Validate currency
    if (settings.currency && settings.currency.length !== 3) {
      return 'Currency code must be 3 characters (e.g., USD, EUR)';
    }

    // Validate colors (hex format)
    const colorFields = ['primaryColor', 'secondaryColor', 'accentColor', 'backgroundColor', 'textColor'];
    for (const field of colorFields) {
      const value = settings[field as keyof ITenantSettings] as string | undefined;
      if (value && !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(value)) {
        return `Invalid color format for ${field}. Use hex format (e.g., #FF5733)`;
      }
    }

    // Validate URLs
    if (settings.logo && !/^https?:\/\/.+/.test(settings.logo)) {
      return 'Logo URL must be a valid HTTP/HTTPS URL';
    }
    if (settings.favicon && !/^https?:\/\/.+/.test(settings.favicon)) {
      return 'Favicon URL must be a valid HTTP/HTTPS URL';
    }
    if (settings.website && !/^https?:\/\/.+/.test(settings.website)) {
      return 'Website URL must be a valid HTTP/HTTPS URL';
    }

    // Validate email
    if (settings.email && !/^\S+@\S+\.\S+$/.test(settings.email)) {
      return 'Invalid email format';
    }

    // Validate tax rate
    if (settings.taxEnabled && (settings.taxRate === undefined || settings.taxRate < 0 || settings.taxRate > 100)) {
      return 'Tax rate must be between 0 and 100';
    }

    // Validate number format
    if (settings.numberFormat) {
      if (settings.numberFormat.decimalPlaces < 0 || settings.numberFormat.decimalPlaces > 4) {
        return 'Decimal places must be between 0 and 4';
      }
      if (
        settings.numberFormat.decimalSeparator &&
        settings.numberFormat.thousandsSeparator &&
        settings.numberFormat.decimalSeparator === settings.numberFormat.thousandsSeparator
      ) {
        return 'Decimal separator and thousands separator must be different';
      }
    }

    return null;
  };

  const handleSave = async () => {
    if (!settings) return;

    // Validate settings before saving
    const validationError = validateSettings();
    if (validationError) {
      setMessage({ type: 'error', text: validationError });
      return;
    }

    try {
      setSaving(true);
      setMessage(null);
      const res = await fetch(`/api/tenants/${tenant}/settings`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for authentication
        body: JSON.stringify({ settings }),
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: dict?.settings?.saved || 'Settings saved successfully!' });
        setSettings(data.data);
        // Clear message after 3 seconds
        setTimeout(() => setMessage(null), 3000);
      } else {
        if (res.status === 401 || res.status === 403) {
          setMessage({
            type: 'error',
            text:
              dict?.settings?.unauthorized ||
              'Unauthorized. Please login with admin or manager account to save settings.',
          });
        } else {
          setMessage({ type: 'error', text: data.error || 'Failed to save settings' });
        }
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: dict?.common?.failedToSaveSettings || 'Failed to save settings. Please check your connection.' });
    } finally {
      setSaving(false);
    }
  };


  const updateSetting = (path: string, value: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!settings) return;
    
    const keys = path.split('.');
    const newSettings = JSON.parse(JSON.stringify(settings)); // Deep clone
    let current: any = newSettings; // eslint-disable-line @typescript-eslint/no-explicit-any
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
    
    // If business type is being changed, show warning
    if (path === 'businessType' && value !== settings.businessType) {
      const template =
        dict?.settings?.businessTypeChangeWarning ||
        'Changing business type to "{type}" will automatically configure features. This may enable or disable certain features based on the business type.';
      setBusinessTypeWarning(template.replace('{type}', String(value)));
    } else if (path !== 'businessType') {
      setBusinessTypeWarning(null);
    }
    
    setSettings(newSettings);
  };

  if (!dict) {
    return <PageLoading label="Loading..." />;
  }

  const settingsDict = (dict.settings ?? {}) as Record<string, string | undefined> & {
    tabs?: Record<string, string | undefined>;
  };

  const pageHeader = (
    <div className="mb-6 sm:mb-8">
      <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
        {settingsDict.title || 'Store Settings'}
      </h1>
      <p className="text-gray-600">
        {settingsDict.subtitle || 'Configure your store preferences and branding'}
      </p>
    </div>
  );

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {pageHeader}
          <SettingsPageSkeleton />
        </div>
      </div>
    );
  }

  if (status === 'error' || !settings) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {pageHeader}
          <div className="bg-white border border-gray-300">
            <ErrorState
              title={settingsDict.failedToLoad || 'Failed to Load Settings'}
              description={
                settingsError ||
                settingsDict.loadErrorDescription ||
                'Unable to load tenant settings. Please check your connection and try again.'
              }
              onRetry={refetch}
              retryLabel={settingsDict.retry || dict.common.retry || 'Retry'}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {pageHeader}

        {message && (
          <div className="mb-6">
            <InlineBanner
              variant={message.type === 'error' ? 'error' : 'info'}
              message={message.text}
              onDismiss={() => setMessage(null)}
              className={
                message.type === 'success'
                  ? 'bg-green-50 text-green-800 border-green-300'
                  : undefined
              }
            />
          </div>
        )}

        <div className="bg-white border border-gray-300 overflow-hidden">
          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="flex overflow-x-auto" aria-label={dict?.common?.tabs || 'Tabs'}>
              <button
                onClick={() => setActiveTab('general')}
                className={`px-6 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === 'general'
                    ? 'border-brand text-brand'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {settingsDict.tabs?.general || 'General'}
              </button>
              <button
                onClick={() => setActiveTab('branding')}
                style={{
                  borderBottomWidth: '2px',
                  borderBottomColor: activeTab === 'branding' ? primaryColor : 'transparent',
                  color: activeTab === 'branding' ? primaryColor : '#6b7280',
                }}
                className="px-6 py-4 text-sm font-medium whitespace-nowrap transition-colors hover:text-gray-700 hover:border-gray-300"
              >
                {settingsDict.tabs?.branding || 'Branding'}
              </button>
              <button
                onClick={() => setActiveTab('contact')}
                style={{
                  borderBottomWidth: '2px',
                  borderBottomColor: activeTab === 'contact' ? primaryColor : 'transparent',
                  color: activeTab === 'contact' ? primaryColor : '#6b7280',
                }}
                className="px-6 py-4 text-sm font-medium whitespace-nowrap transition-colors hover:text-gray-700 hover:border-gray-300"
              >
                {settingsDict.tabs?.contact || 'Contact'}
              </button>
              <button
                onClick={() => setActiveTab('receipt')}
                style={{
                  borderBottomWidth: '2px',
                  borderBottomColor: activeTab === 'receipt' ? primaryColor : 'transparent',
                  color: activeTab === 'receipt' ? primaryColor : '#6b7280',
                }}
                className="px-6 py-4 text-sm font-medium whitespace-nowrap transition-colors hover:text-gray-700 hover:border-gray-300"
              >
                {settingsDict.tabs?.receipt || 'Receipt'}
              </button>
              <button
                onClick={() => setActiveTab('business')}
                style={{
                  borderBottomWidth: '2px',
                  borderBottomColor: activeTab === 'business' ? primaryColor : 'transparent',
                  color: activeTab === 'business' ? primaryColor : '#6b7280',
                }}
                className="px-6 py-4 text-sm font-medium whitespace-nowrap transition-colors hover:text-gray-700 hover:border-gray-300"
              >
                {settingsDict.tabs?.business || 'Business'}
              </button>
              <button
                onClick={() => setActiveTab('notifications')}
                style={{
                  borderBottomWidth: '2px',
                  borderBottomColor: activeTab === 'notifications' ? primaryColor : 'transparent',
                  color: activeTab === 'notifications' ? primaryColor : '#6b7280',
                }}
                className="px-6 py-4 text-sm font-medium whitespace-nowrap transition-colors hover:text-gray-700 hover:border-gray-300"
              >
                {settingsDict.tabs?.notifications || 'Notifications'}
              </button>
              <button
                onClick={() => setActiveTab('multiCurrency')}
                style={{
                  borderBottomWidth: '2px',
                  borderBottomColor: activeTab === 'multiCurrency' ? primaryColor : 'transparent',
                  color: activeTab === 'multiCurrency' ? primaryColor : '#6b7280',
                }}
                className="px-6 py-4 text-sm font-medium whitespace-nowrap transition-colors hover:text-gray-700 hover:border-gray-300"
              >
                {settingsDict.tabs?.multiCurrency || 'Multi-Currency'}
              </button>
              <button
                onClick={() => setActiveTab('ecommerce')}
                style={{
                  borderBottomWidth: '2px',
                  borderBottomColor: activeTab === 'ecommerce' ? primaryColor : 'transparent',
                  color: activeTab === 'ecommerce' ? primaryColor : '#6b7280',
                }}
                className="px-6 py-4 text-sm font-medium whitespace-nowrap transition-colors hover:text-gray-700 hover:border-gray-300"
              >
                {settingsDict.tabs?.ecommerce || 'E-commerce'}
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-5 sm:p-6 lg:p-8">
            {/* General Tab */}
            {activeTab === 'general' && (
              <div className="space-y-8">
                {/* Currency & Localization */}
                <section>
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-xl font-bold text-gray-900">{settingsDict.currencyLocalization || 'Currency & Localization'}</h2>
                    <button
                      onClick={autoDetectLocation}
                      disabled={detecting}
                      className="px-4 py-2 text-sm font-medium text-brand bg-brand-soft hover:bg-brand-soft transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 border border-teal-300"
                    >
                      {detecting ? (
                        <>
                          <div className="animate-spin h-4 w-4 border-b-2 border-brand"></div>
                          <span>{settingsDict.detecting || 'Detecting...'}</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>{settingsDict.detectLocation || 'Auto-Detect Location'}</span>
                        </>
                      )}
                    </button>
                  </div>
                  {detectedInfo && (
                    <div className="mb-5">
                      <InlineBanner
                        variant="info"
                        message={detectedInfo}
                        onDismiss={() => setDetectedInfo(null)}
                        className="bg-green-50 text-green-800 border-green-300"
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {settingsDict.currencyCode || 'Currency Code'}
                      </label>
                      <input
                        type="text"
                        value={settings.currency || 'USD'}
                        onChange={(e) => {
                          const newCurrency = e.target.value.toUpperCase();
                          const symbol = getCurrencySymbolForCode(newCurrency);
                          // Update both fields in one setState to avoid React batching overwrite
                          setSettings(prev => {
                            if (!prev) return prev;
                            return {
                              ...prev,
                              currency: newCurrency,
                              ...(symbol !== newCurrency ? { currencySymbol: symbol } : {}),
                            };
                          });
                        }}
                        className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                        placeholder={settingsDict.currencyPlaceholder || 'USD'}
                        maxLength={3}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {settingsDict.currencySymbol || 'Currency Symbol'}
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={settings.currencySymbol || getCurrencySymbolForCode(settings.currency || 'USD')}
                          onChange={(e) => updateSetting('currencySymbol', e.target.value)}
                          className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                          placeholder="$"
                        />
                        {!settings.currencySymbol && (
                          <button
                            type="button"
                            onClick={() => updateSetting('currencySymbol', getCurrencySymbolForCode(settings.currency || 'USD'))}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-brand hover:text-brand-hover font-medium"
                            title={dict?.common?.autoFillSymbol || 'Auto-fill symbol'}
                          >
                            Auto
                          </button>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {settingsDict.currencyPosition || 'Currency Position'}
                      </label>
                      <select
                        value={settings.currencyPosition || 'before'}
                        onChange={(e) => updateSetting('currencyPosition', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                      >
                        <option value="before">{settingsDict.currencyPositionBefore || 'Before amount ($100)'}</option>
                        <option value="after">{settingsDict.currencyPositionAfter || 'After amount (100$)'}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {settingsDict.timezone || 'Timezone'}
                      </label>
                      <input
                        type="text"
                        value={settings.timezone || 'UTC'}
                        onChange={(e) => updateSetting('timezone', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                        placeholder={settingsDict.timezonePlaceholder || 'America/New_York'}
                        list="timezone-suggestions"
                      />
                      <datalist id="timezone-suggestions">
                        <option value="America/New_York">Eastern Time (US)</option>
                        <option value="America/Chicago">Central Time (US)</option>
                        <option value="America/Denver">Mountain Time (US)</option>
                        <option value="America/Los_Angeles">Pacific Time (US)</option>
                        <option value="Europe/London">London (UK)</option>
                        <option value="Europe/Paris">Paris (France)</option>
                        <option value="Europe/Berlin">Berlin (Germany)</option>
                        <option value="Asia/Tokyo">Tokyo (Japan)</option>
                        <option value="Asia/Shanghai">Shanghai (China)</option>
                        <option value="Australia/Sydney">Sydney (Australia)</option>
                        <option value="UTC">UTC</option>
                      </datalist>
                      <p className="mt-2 text-xs text-gray-500">
                        Detected: {Intl.DateTimeFormat().resolvedOptions().timeZone}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {settingsDict.dateFormat || 'Date Format'}
                      </label>
                      <select
                        value={settings.dateFormat || 'MM/DD/YYYY'}
                        onChange={(e) => updateSetting('dateFormat', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                      >
                        <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                        <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                        <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {settingsDict.timeFormat || 'Time Format'}
                      </label>
                      <select
                        value={settings.timeFormat || '12h'}
                        onChange={(e) => updateSetting('timeFormat', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                      >
                        <option value="12h">{settingsDict.timeFormat12h || '12-hour (AM/PM)'}</option>
                        <option value="24h">{settingsDict.timeFormat24h || '24-hour'}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {settingsDict.language || 'Language'}
                      </label>
                      <select
                        value={settings.language || 'en'}
                        onChange={async (e) => {
                          const newLang = e.target.value as 'en' | 'es';
                          updateSetting('language', newLang);

                          // Save only the language field, preserving all existing server-side settings
                          try {
                            setSaving(true);
                            setMessage(null);
                            const res = await fetch(`/api/tenants/${tenant}/settings`, {
                              method: 'PUT',
                              headers: {
                                'Content-Type': 'application/json',
                              },
                              credentials: 'include',
                              body: JSON.stringify({
                                settings: { language: newLang }
                              }),
                            });

                            const data = await res.json();
                            if (data.success) {
                              // Redirect to new language
                              const currentPath = window.location.pathname.replace(`/${tenant}/${lang}`, '') || '/';
                              router.push(`/${tenant}/${newLang}${currentPath}`);
                            } else {
                              setMessage({ type: 'error', text: data.error || 'Failed to save language setting' });
                            }
                          } catch (error) {
                            console.error('Error saving language:', error);
                            setMessage({ type: 'error', text: dict?.common?.failedToSaveLanguageSetting || 'Failed to save language setting' });
                          } finally {
                            setSaving(false);
                          }
                        }}
                        className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                      >
                        <option value="en">English</option>
                        <option value="es">Español</option>
                      </select>
                      <p className="mt-2 text-xs text-gray-500">
                        {settingsDict.languageChangeHint || 'Changing language will save settings and reload the page'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {settingsDict.decimalSeparator || 'Decimal Separator'}
                      </label>
                      <select
                        value={settings.numberFormat?.decimalSeparator || '.'}
                        onChange={(e) => updateSetting('numberFormat.decimalSeparator', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                      >
                        <option value=".">{settingsDict.separatorPeriod || 'Period (.)'}</option>
                        <option value=",">{settingsDict.separatorComma || 'Comma (,)'}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {settingsDict.thousandsSeparator || 'Thousands Separator'}
                      </label>
                      <select
                        value={settings.numberFormat?.thousandsSeparator || ','}
                        onChange={(e) => updateSetting('numberFormat.thousandsSeparator', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                      >
                        <option value=",">{settingsDict.separatorComma || 'Comma (,)'}</option>
                        <option value=".">{settingsDict.separatorPeriod || 'Period (.)'}</option>
                        <option value=" ">{settingsDict.separatorSpace || 'Space ( )'}</option>
                        <option value="">{settingsDict.separatorNone || 'None'}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {settingsDict.decimalPlaces || 'Decimal Places'}
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="4"
                        value={settings.numberFormat?.decimalPlaces || 2}
                        onChange={(e) => updateSetting('numberFormat.decimalPlaces', parseInt(e.target.value) || 2)}
                        className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                      />
                    </div>
                  </div>
                </section>

                {/* Tax Settings */}
                <section>
                  <h2 className="text-xl font-bold text-gray-900 mb-5">{settingsDict.taxSettings || 'Tax Settings'}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="taxEnabled"
                        checked={settings.taxEnabled || false}
                        onChange={(e) => updateSetting('taxEnabled', e.target.checked)}
                        className="h-4 w-4 text-brand focus:ring-brand border-gray-300 cursor-pointer"
                      />
                      <label htmlFor="taxEnabled" className="ml-2 text-sm font-medium text-gray-700">
                        {settingsDict.enableTax || 'Enable Tax'}
                      </label>
                    </div>
                    {settings.taxEnabled && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {settingsDict.taxRate || 'Tax Rate (%)'}
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={settings.taxRate || 0}
                            onChange={(e) => updateSetting('taxRate', parseFloat(e.target.value) || 0)}
                            className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {settingsDict.taxLabel || 'Tax Label'}
                          </label>
                          <input
                            type="text"
                            value={settings.taxLabel || 'Tax'}
                            onChange={(e) => updateSetting('taxLabel', e.target.value)}
                            className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                            placeholder={settingsDict.taxNamePlaceholder || 'VAT, GST, Sales Tax'}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </section>
              </div>
            )}

            {/* Branding Tab */}
            {activeTab === 'branding' && (
              <section className="space-y-8">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-5">{settingsDict.basicBranding || 'Basic Branding'}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {settingsDict.companyName || 'Company Name'}
                    </label>
                    <input
                      type="text"
                      value={settings.companyName || ''}
                      onChange={(e) => updateSetting('companyName', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {settingsDict.logoUrl || 'Logo URL'}
                    </label>
                    <input
                      type="url"
                      value={settings.logo || ''}
                      onChange={(e) => updateSetting('logo', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                      placeholder="https://example.com/logo.png"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {settingsDict.faviconUrl || 'Favicon URL'}
                    </label>
                    <input
                      type="url"
                      value={settings.favicon || ''}
                      onChange={(e) => updateSetting('favicon', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                      placeholder="https://example.com/favicon.ico"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {settingsDict.primaryColor || 'Primary Color'}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={settings.primaryColor || '#35979c'}
                        onChange={(e) => updateSetting('primaryColor', e.target.value)}
                        className="h-10 w-20 border-2 border-gray-300 cursor-pointer bg-white"
                      />
                      <input
                        type="text"
                        value={settings.primaryColor || '#35979c'}
                        onChange={(e) => updateSetting('primaryColor', e.target.value)}
                        className="flex-1 px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                        placeholder="#35979c"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {settingsDict.secondaryColor || 'Secondary Color'}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={settings.secondaryColor || '#64748b'}
                        onChange={(e) => updateSetting('secondaryColor', e.target.value)}
                        className="h-10 w-20 border-2 border-gray-300 cursor-pointer bg-white"
                      />
                      <input
                        type="text"
                        value={settings.secondaryColor || ''}
                        onChange={(e) => updateSetting('secondaryColor', e.target.value)}
                        className="flex-1 px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                        placeholder="#64748b"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {settingsDict.accentColor || 'Accent Color'}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={settings.accentColor || '#10b981'}
                        onChange={(e) => updateSetting('accentColor', e.target.value)}
                        className="h-10 w-20 border-2 border-gray-300 cursor-pointer bg-white"
                      />
                      <input
                        type="text"
                        value={settings.accentColor || ''}
                        onChange={(e) => updateSetting('accentColor', e.target.value)}
                        className="flex-1 px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                        placeholder="#10b981"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {settingsDict.backgroundColor || 'Background Color'}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={settings.backgroundColor || '#ffffff'}
                        onChange={(e) => updateSetting('backgroundColor', e.target.value)}
                        className="h-10 w-20 border-2 border-gray-300 cursor-pointer bg-white"
                      />
                      <input
                        type="text"
                        value={settings.backgroundColor || ''}
                        onChange={(e) => updateSetting('backgroundColor', e.target.value)}
                        className="flex-1 px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                        placeholder="#ffffff"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {settingsDict.textColor || 'Text Color'}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={settings.textColor || '#111827'}
                        onChange={(e) => updateSetting('textColor', e.target.value)}
                        className="h-10 w-20 border-2 border-gray-300 cursor-pointer bg-white"
                      />
                      <input
                        type="text"
                        value={settings.textColor || ''}
                        onChange={(e) => updateSetting('textColor', e.target.value)}
                        className="flex-1 px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                        placeholder="#111827"
                      />
                    </div>
                  </div>
                </div>
                </div>

                {/* Advanced Branding Section - Moved to Admin */}
                <div className="pt-8 mt-8 border-t-2 border-gray-200">
                  <div className="p-4 bg-brand-soft border border-teal-200 rounded">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{settingsDict.advancedBranding || 'Advanced Branding'}</h3>
                    <p className="text-sm text-brand-navy mb-3">
                      {settingsDict.advancedBrandingNote || 'Advanced branding features (custom fonts, themes, CSS) have been moved to Admin → Advanced Branding for better access control.'}
                    </p>
                    <Link
                      href={`/${tenant}/${lang}/admin/advanced-branding`}
                      className="inline-flex items-center px-4 py-2 bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors"
                    >
                      {dict?.admin?.advancedBranding || 'Advanced Branding'} →
                    </Link>
                  </div>
                </div>
              </section>
            )}

            {/* Contact Tab */}
            {activeTab === 'contact' && (
              <section>
                <h2 className="text-xl font-bold text-gray-900 mb-5">{settingsDict.contactInformation || 'Contact Information'}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{settingsDict.email || 'Email'}</label>
                    <input
                      type="email"
                      value={settings.email || ''}
                      onChange={(e) => updateSetting('email', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{settingsDict.phone || 'Phone'}</label>
                    <input
                      type="tel"
                      value={settings.phone || ''}
                      onChange={(e) => updateSetting('phone', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">{settingsDict.streetAddress || 'Street Address'}</label>
                    <input
                      type="text"
                      value={settings.address?.street || ''}
                      onChange={(e) => updateSetting('address.street', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{settingsDict.city || 'City'}</label>
                    <input
                      type="text"
                      value={settings.address?.city || ''}
                      onChange={(e) => updateSetting('address.city', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{settingsDict.stateProvince || 'State/Province'}</label>
                    <input
                      type="text"
                      value={settings.address?.state || ''}
                      onChange={(e) => updateSetting('address.state', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{settingsDict.zipPostalCode || 'ZIP/Postal Code'}</label>
                    <input
                      type="text"
                      value={settings.address?.zipCode || ''}
                      onChange={(e) => updateSetting('address.zipCode', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{settingsDict.country || 'Country'}</label>
                    <input
                      type="text"
                      value={settings.address?.country || ''}
                      onChange={(e) => updateSetting('address.country', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{settingsDict.website || 'Website'}</label>
                    <input
                      type="url"
                      value={settings.website || ''}
                      onChange={(e) => updateSetting('website', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                      placeholder="https://example.com"
                    />
                  </div>
                </div>
              </section>
            )}

            {/* Receipt Tab */}
            {activeTab === 'receipt' && (
              <section>
                <h2 className="text-xl font-bold text-gray-900 mb-5">{settingsDict.receiptInvoiceSettings || 'Receipt & Invoice Settings'}</h2>
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {settingsDict.receiptHeader || 'Receipt Header'}
                    </label>
                    <textarea
                      value={settings.receiptHeader || ''}
                      onChange={(e) => updateSetting('receiptHeader', e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                      placeholder={settingsDict.receiptHeaderPlaceholder || 'Custom header text to appear at the top of receipts'}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {settingsDict.receiptFooter || 'Receipt Footer'}
                    </label>
                    <textarea
                      value={settings.receiptFooter || ''}
                      onChange={(e) => updateSetting('receiptFooter', e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                      placeholder={settingsDict.receiptFooterPlaceholder || 'Custom footer text to appear at the bottom of receipts'}
                    />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">{settingsDict.displayOptions || 'Display Options'}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center p-4 border-2 border-gray-300 hover:bg-gray-50 transition-colors">
                        <input
                          type="checkbox"
                          id="receiptShowLogo"
                          checked={settings.receiptShowLogo !== false}
                          onChange={(e) => updateSetting('receiptShowLogo', e.target.checked)}
                          className="h-5 w-5 text-brand focus:ring-brand border-gray-300 cursor-pointer"
                        />
                        <label htmlFor="receiptShowLogo" className="ml-3 text-sm font-medium text-gray-700">
                          {settingsDict.showLogoOnReceipts || 'Show Logo on Receipts'}
                        </label>
                      </div>
                      <div className="flex items-center p-4 border-2 border-gray-300 hover:bg-gray-50 transition-colors">
                        <input
                          type="checkbox"
                          id="receiptShowAddress"
                          checked={settings.receiptShowAddress !== false}
                          onChange={(e) => updateSetting('receiptShowAddress', e.target.checked)}
                          className="h-5 w-5 text-brand focus:ring-brand border-gray-300 cursor-pointer"
                        />
                        <label htmlFor="receiptShowAddress" className="ml-3 text-sm font-medium text-gray-700">
                          {settingsDict.showAddressOnReceipts || 'Show Address on Receipts'}
                        </label>
                      </div>
                      <div className="flex items-center p-4 border-2 border-gray-300 hover:bg-gray-50 transition-colors">
                        <input
                          type="checkbox"
                          id="receiptShowPhone"
                          checked={settings.receiptShowPhone || false}
                          onChange={(e) => updateSetting('receiptShowPhone', e.target.checked)}
                          className="h-5 w-5 text-brand focus:ring-brand border-gray-300 cursor-pointer"
                        />
                        <label htmlFor="receiptShowPhone" className="ml-3 text-sm font-medium text-gray-700">
                          {settingsDict.showPhoneOnReceipts || 'Show Phone on Receipts'}
                        </label>
                      </div>
                      <div className="flex items-center p-4 border-2 border-gray-300 hover:bg-gray-50 transition-colors">
                        <input
                          type="checkbox"
                          id="receiptShowEmail"
                          checked={settings.receiptShowEmail || false}
                          onChange={(e) => updateSetting('receiptShowEmail', e.target.checked)}
                          className="h-5 w-5 text-brand focus:ring-brand border-gray-300 cursor-pointer"
                        />
                        <label htmlFor="receiptShowEmail" className="ml-3 text-sm font-medium text-gray-700">
                          {settingsDict.showEmailOnReceipts || 'Show Email on Receipts'}
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* BIR Compliance Section */}
                <div className="mt-8 pt-8 border-t-2 border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">{settingsDict.birCompliance || 'BIR Compliance'}</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    {settingsDict.birComplianceDesc || 'Required fields for Bureau of Internal Revenue (BIR) official receipts in the Philippines.'}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {settingsDict.birTin || 'BIR TIN'} <span className="text-gray-400 font-normal">(NNN-NNN-NNN-NNN)</span>
                      </label>
                      <input
                        type="text"
                        value={settings.birTin || ''}
                        onChange={(e) => updateSetting('birTin', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                        placeholder="000-000-000-000"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {settingsDict.birBusinessStyle || 'Business Style'} <span className="text-gray-400 font-normal">(trade name)</span>
                      </label>
                      <input
                        type="text"
                        value={settings.birBusinessStyle || ''}
                        onChange={(e) => updateSetting('birBusinessStyle', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                        placeholder="Retail / Trading / Services"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {settingsDict.birPtuNumber || 'PTU No.'} <span className="text-gray-400 font-normal">(Permit to Use)</span>
                      </label>
                      <input
                        type="text"
                        value={settings.birPtuNumber || ''}
                        onChange={(e) => updateSetting('birPtuNumber', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                        placeholder="POS-0001-2024"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {settingsDict.birPtuIssuedDate || 'PTU Date Issued'}
                      </label>
                      <input
                        type="date"
                        value={settings.birPtuIssuedDate ? new Date(settings.birPtuIssuedDate).toISOString().slice(0, 10) : ''}
                        onChange={(e) => updateSetting('birPtuIssuedDate', e.target.value ? new Date(e.target.value) : undefined)}
                        className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {settingsDict.birMinNumber || 'MIN'} <span className="text-gray-400 font-normal">(Machine Identification No.)</span>
                      </label>
                      <input
                        type="text"
                        value={settings.birMinNumber || ''}
                        onChange={(e) => updateSetting('birMinNumber', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                        placeholder="MIN assigned by BIR"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {settingsDict.birSystemProvider || 'Accredited System Provider'}
                      </label>
                      <input
                        type="text"
                        value={settings.birSystemProvider || ''}
                        onChange={(e) => updateSetting('birSystemProvider', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                        placeholder="LocalPro POS"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-3">
                    {settingsDict.birVatNote || 'Set Tax Label to "VAT" in General → Tax Settings to print a VAT receipt. Non-VAT receipts will show "THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX".'}
                  </p>
                </div>

                {/* Receipt Templates Section */}
                <div className="mt-8 pt-8 border-t-2 border-gray-200">
                  <ReceiptTemplatesManager
                    settings={settings}
                    tenant={tenant}
                    onUpdate={(updates) => {
                      setSettings({ ...settings, ...updates });
                    }}
                    dict={dict}
                  />
                </div>
              </section>
            )}

            {/* Business Tab */}
            {activeTab === 'business' && (
              <section>
                <h2 className="text-xl font-bold text-gray-900 mb-5">{settingsDict.businessInformation || 'Business Information'}</h2>
                
                {businessTypeWarning && (
                  <div className="mb-6">
                    <InlineBanner variant="warning" message={businessTypeWarning} />
                  </div>
                )}

                <div className="space-y-6">
                  {/* Business Type Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {settingsDict.businessType || 'Business Type'} <span className="text-red-500">*</span>
                    </label>
                    {businessTypesStatus === 'loading' ? (
                      <div className="w-full px-4 py-3 border-2 border-gray-300 bg-gray-50 flex items-center justify-center gap-2">
                        <LoadingSpinner size="sm" />
                        <span className="text-sm text-gray-600">
                          {settingsDict.loadingBusinessTypes || 'Loading business types...'}
                        </span>
                      </div>
                    ) : (
                      <>
                        <select
                          value={settings.businessType || 'general'}
                          onChange={(e) => updateSetting('businessType', e.target.value)}
                          className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                        >
                          {businessTypes.map((type) => (
                            <option key={type.type} value={type.type}>
                              {type.name}
                            </option>
                          ))}
                        </select>
                        {settings.businessType && businessTypesStatus === 'ready' && (
                          <div className="mt-3 p-4 bg-brand-soft border-2 border-teal-200">
                            <p className="text-sm text-brand-navy-deep font-medium mb-2">
                              {businessTypes.find((t) => t.type === settings.businessType)?.name || 'Business Type'}
                            </p>
                            <p className="text-xs text-brand-hover mb-3">
                              {businessTypes.find((t) => t.type === settings.businessType)?.description || ''}
                            </p>
                            <div className="mt-3 pt-3 border-t border-teal-300">
                              <p className="text-xs font-medium text-brand-navy-deep mb-2">{settingsDict.defaultFeatures || 'Default Features:'}</p>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {businessTypes.find((t) => t.type === settings.businessType)?.defaultFeatures && Object.entries(
                                  businessTypes.find((t) => t.type === settings.businessType)?.defaultFeatures || {}
                                ).map(([feature, enabled]) => (
                                  <div key={feature} className="flex items-center gap-2">
                                    <svg
                                      className={`w-4 h-4 ${enabled ? 'text-green-600' : 'text-gray-400'}`}
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      {enabled ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      ) : (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                      )}
                                    </svg>
                                    <span className={`text-xs ${enabled ? 'text-green-700' : 'text-gray-500'}`}>
                                      {feature.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Business Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {settingsDict.taxIdEin || 'Tax ID / EIN'}
                      </label>
                      <input
                        type="text"
                        value={settings.taxId || ''}
                        onChange={(e) => updateSetting('taxId', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                        placeholder="12-3456789"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Registration Number
                      </label>
                      <input
                        type="text"
                        value={settings.registrationNumber || ''}
                        onChange={(e) => updateSetting('registrationNumber', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                        placeholder={settingsDict.registrationNumberPlaceholder || 'Business registration number'}
                      />
                    </div>
                  </div>

                  {/* Feature Flags Section */}
                  {settings.businessType && (
                    <div className="mt-6 pt-6 border-t-2 border-gray-200">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">{settingsDict.featureConfiguration || 'Feature Configuration'}</h3>
                      <p className="text-sm text-gray-600 mb-4">
                        {settingsDict.featureConfigurationDesc || 'These features are automatically configured based on your business type. You can override them if needed.'}
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex items-center p-4 border-2 border-gray-300 hover:bg-gray-50 transition-colors">
                          <input
                            type="checkbox"
                            id="enableInventory"
                            checked={settings.enableInventory !== false}
                            onChange={(e) => updateSetting('enableInventory', e.target.checked)}
                            className="h-5 w-5 text-brand focus:ring-brand border-gray-300 cursor-pointer"
                          />
                          <label htmlFor="enableInventory" className="ml-3 flex-1">
                            <div className="text-sm font-medium text-gray-900">{settingsDict.inventoryManagement || 'Inventory Management'}</div>
                            <div className="text-xs text-gray-500 mt-1">{settingsDict.inventoryManagementDesc || 'Track product stock levels'}</div>
                          </label>
                        </div>
                        <div className="flex items-center p-4 border-2 border-gray-300 hover:bg-gray-50 transition-colors">
                          <input
                            type="checkbox"
                            id="enableCategories"
                            checked={settings.enableCategories !== false}
                            onChange={(e) => updateSetting('enableCategories', e.target.checked)}
                            className="h-5 w-5 text-brand focus:ring-brand border-gray-300 cursor-pointer"
                          />
                          <label htmlFor="enableCategories" className="ml-3 flex-1">
                            <div className="text-sm font-medium text-gray-900">{settingsDict.categoriesFeature || 'Categories'}</div>
                            <div className="text-xs text-gray-500 mt-1">{settingsDict.categoriesFeatureDesc || 'Organize products by categories'}</div>
                          </label>
                        </div>
                        <div className="flex items-center p-4 border-2 border-gray-300 hover:bg-gray-50 transition-colors">
                          <input
                            type="checkbox"
                            id="enableDiscounts"
                            checked={settings.enableDiscounts || false}
                            onChange={(e) => updateSetting('enableDiscounts', e.target.checked)}
                            className="h-5 w-5 text-brand focus:ring-brand border-gray-300 cursor-pointer"
                          />
                          <label htmlFor="enableDiscounts" className="ml-3 flex-1">
                            <div className="text-sm font-medium text-gray-900">{settingsDict.discountsPromotions || 'Discounts & Promotions'}</div>
                            <div className="text-xs text-gray-500 mt-1">{settingsDict.discountsPromotionsDesc || 'Create discount codes and promotions'}</div>
                          </label>
                        </div>
                        <div className="flex items-center p-4 border-2 border-gray-300 hover:bg-gray-50 transition-colors">
                          <input
                            type="checkbox"
                            id="enableLoyaltyProgram"
                            checked={settings.enableLoyaltyProgram || false}
                            onChange={(e) => updateSetting('enableLoyaltyProgram', e.target.checked)}
                            className="h-5 w-5 text-brand focus:ring-brand border-gray-300 cursor-pointer"
                          />
                          <label htmlFor="enableLoyaltyProgram" className="ml-3 flex-1">
                            <div className="text-sm font-medium text-gray-900">{settingsDict.loyaltyProgram || 'Loyalty Program'}</div>
                            <div className="text-xs text-gray-500 mt-1">{settingsDict.loyaltyProgramDesc || 'Customer loyalty and rewards'}</div>
                          </label>
                        </div>
                        <div className="flex items-center p-4 border-2 border-gray-300 hover:bg-gray-50 transition-colors">
                          <input
                            type="checkbox"
                            id="enableCustomerManagement"
                            checked={settings.enableCustomerManagement || false}
                            onChange={(e) => updateSetting('enableCustomerManagement', e.target.checked)}
                            className="h-5 w-5 text-brand focus:ring-brand border-gray-300 cursor-pointer"
                          />
                          <label htmlFor="enableCustomerManagement" className="ml-3 flex-1">
                            <div className="text-sm font-medium text-gray-900">{settingsDict.customerManagementFeature || 'Customer Management'}</div>
                            <div className="text-xs text-gray-500 mt-1">{settingsDict.customerManagementFeatureDesc || 'Manage customer profiles and history'}</div>
                          </label>
                        </div>
                        <div className="flex items-center p-4 border-2 border-gray-300 hover:bg-gray-50 transition-colors">
                          <input
                            type="checkbox"
                            id="enableOnAccountSales"
                            checked={settings.enableOnAccountSales || false}
                            onChange={(e) => updateSetting('enableOnAccountSales', e.target.checked)}
                            className="h-5 w-5 text-brand focus:ring-brand border-gray-300 cursor-pointer"
                          />
                          <label htmlFor="enableOnAccountSales" className="ml-3 flex-1">
                            <div className="text-sm font-medium text-gray-900">{settingsDict.onAccountSales || 'Charge to customer account (pay later)'}</div>
                            <div className="text-xs text-gray-500 mt-1">{settingsDict.onAccountSalesDesc || 'Allow POS to put sales on a customer’s balance when they cannot pay immediately'}</div>
                          </label>
                        </div>
                        <div className="flex items-center p-4 border-2 border-gray-300 hover:bg-gray-50 transition-colors">
                          <input
                            type="checkbox"
                            id="enableBookingScheduling"
                            checked={settings.enableBookingScheduling || false}
                            onChange={(e) => updateSetting('enableBookingScheduling', e.target.checked)}
                            className="h-5 w-5 text-brand focus:ring-brand border-gray-300 cursor-pointer"
                          />
                          <label htmlFor="enableBookingScheduling" className="ml-3 flex-1">
                            <div className="text-sm font-medium text-gray-900">{settingsDict.bookingScheduling || 'Booking & Scheduling'}</div>
                            <div className="text-xs text-gray-500 mt-1">{settingsDict.bookingSchedulingDesc || 'Appointment and service scheduling'}</div>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Notifications Tab */}
            {activeTab === 'notifications' && (
              <section>
                <h2 className="text-xl font-bold text-gray-900 mb-5">{settingsDict.notificationSettings || 'Notification Settings'}</h2>
                <p className="text-sm text-gray-600 mb-6">
                  {settingsDict.configureNotificationPreferences || 'Configure notification preferences and alert thresholds'}
                </p>
                <div className="space-y-6">
                  <div className="p-4 bg-brand-soft border border-teal-200 rounded">
                    <p className="text-sm text-brand-navy mb-2">
                      <strong>Note:</strong> {settingsDict.notificationTemplateNote || 'Notification template customization has been moved to Admin → Notification Templates for better access control.'}
                    </p>
                    <Link
                      href={`/${tenant}/${lang}/admin/notification-templates`}
                      className="text-sm text-brand hover:text-brand-hover font-medium underline"
                    >
                      {settingsDict.customizeTemplates || 'Customize Templates →'}
                    </Link>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">{settingsDict.stockAlerts || 'Stock Alerts'}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {settingsDict.lowStockThreshold || 'Low Stock Threshold'}
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={settings.lowStockThreshold || 10}
                          onChange={(e) => updateSetting('lowStockThreshold', parseInt(e.target.value) || 10)}
                          className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                        />
                        <p className="mt-2 text-xs text-gray-500">
                          {settingsDict.lowStockThresholdHint || 'Alert when stock falls below this quantity'}
                        </p>
                      </div>
                      <div className="flex items-center p-4 border-2 border-gray-300 hover:bg-gray-50 transition-colors">
                        <input
                          type="checkbox"
                          id="lowStockAlert"
                          checked={settings.lowStockAlert !== false}
                          onChange={(e) => updateSetting('lowStockAlert', e.target.checked)}
                          className="h-5 w-5 text-brand focus:ring-brand border-gray-300 cursor-pointer"
                        />
                        <label htmlFor="lowStockAlert" className="ml-3 flex-1">
                          <div className="text-sm font-medium text-gray-900">
                            {settingsDict.enableLowStockAlerts || 'Enable Low Stock Alerts'}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {settingsDict.lowStockAlertDesc || 'Get notified when products fall below threshold'}
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">{settingsDict.notificationChannels || 'Notification Channels'}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center p-4 border-2 border-gray-300 hover:bg-gray-50 transition-colors">
                        <input
                          type="checkbox"
                          id="emailNotifications"
                          checked={settings.emailNotifications || false}
                          onChange={(e) => updateSetting('emailNotifications', e.target.checked)}
                          className="h-5 w-5 text-brand focus:ring-brand border-gray-300 cursor-pointer"
                        />
                        <label htmlFor="emailNotifications" className="ml-3 flex-1">
                          <div className="text-sm font-medium text-gray-900">
                            {settingsDict.enableEmailNotifications || 'Enable Email Notifications'}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {settingsDict.emailNotificationsDesc || 'Receive notifications via email'}
                          </div>
                        </label>
                      </div>
                      <div className="flex items-center p-4 border-2 border-gray-300 hover:bg-gray-50 transition-colors">
                        <input
                          type="checkbox"
                          id="smsNotifications"
                          checked={settings.smsNotifications || false}
                          onChange={(e) => updateSetting('smsNotifications', e.target.checked)}
                          className="h-5 w-5 text-brand focus:ring-brand border-gray-300 cursor-pointer"
                        />
                        <label htmlFor="smsNotifications" className="ml-3 flex-1">
                          <div className="text-sm font-medium text-gray-900">
                            {settingsDict.enableSmsNotifications || 'Enable SMS Notifications'}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {settingsDict.smsNotificationsDesc || 'Receive notifications via SMS'}
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Attendance Notifications */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">{settingsDict.attendanceNotificationsSection || 'Attendance Notifications'}</h3>
                    <p className="text-sm text-gray-500 mb-3">{settingsDict.attendanceNotificationsSectionDesc || 'Alert managers when staff miss clock-in or forget to clock out.'}</p>
                    <div className="space-y-4">
                      <div className="flex items-center p-4 border-2 border-gray-300 hover:bg-gray-50 transition-colors">
                        <input
                          type="checkbox"
                          id="attendanceNotificationsEnabled"
                          checked={settings.attendanceNotifications?.enabled !== false}
                          onChange={(e) => updateSetting('attendanceNotifications.enabled', e.target.checked)}
                          className="h-5 w-5 text-brand focus:ring-brand border-gray-300 cursor-pointer"
                        />
                        <label htmlFor="attendanceNotificationsEnabled" className="ml-3 flex-1">
                          <div className="text-sm font-medium text-gray-900">{settingsDict.enableAttendanceAlerts || 'Enable Attendance Alerts'}</div>
                          <div className="text-xs text-gray-500 mt-1">{settingsDict.enableAttendanceAlertsDesc || 'Notify managers of missed clock-ins and forgotten clock-outs'}</div>
                        </label>
                      </div>

                      {settings.attendanceNotifications?.enabled !== false && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              {settingsDict.expectedClockInTime || 'Expected Clock-In Time'}
                            </label>
                            <input
                              type="time"
                              value={settings.attendanceNotifications?.expectedStartTime || '09:00'}
                              onChange={(e) => updateSetting('attendanceNotifications.expectedStartTime', e.target.value)}
                              className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                            />
                            <p className="text-xs text-gray-500 mt-1">{settingsDict.expectedClockInTimeHint || "Alert if staff haven't clocked in by this time"}</p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              {settingsDict.maxHoursWithoutClockOut || 'Max Hours Without Clock-Out'}
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={24}
                              value={settings.attendanceNotifications?.maxHoursWithoutClockOut ?? 12}
                              onChange={(e) => updateSetting('attendanceNotifications.maxHoursWithoutClockOut', Number(e.target.value))}
                              className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-white"
                            />
                            <p className="text-xs text-gray-500 mt-1">{settingsDict.maxHoursWithoutClockOutHint || 'Alert after this many hours without clocking out (1–24)'}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              </section>
            )}


            {activeTab === 'ecommerce' && <EcommerceIntegrationsSettings tenant={tenant} lang={lang} />}

            {/* Multi-Currency Tab */}
            {activeTab === 'multiCurrency' && (
              <section>
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-2">{settingsDict.multiCurrencySettings || 'Multi-Currency Settings'}</h2>
                  <p className="text-sm text-gray-600">
                    {settingsDict.multiCurrencySettingsSubtitle || 'Configure which currencies to display'}
                  </p>
                </div>
                <MultiCurrencyDisplaySettings
                  settings={settings}
                  tenant={tenant}
                  lang={lang}
                  onUpdate={(updates) => {
                    setSettings({ ...settings, ...updates });
                  }}
                  dict={dict}
                />
              </section>
            )}

            {/* Save Button */}
            <div className="flex justify-end pt-6 mt-8 border-t border-gray-200">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-3 bg-brand text-white hover:bg-brand-hover font-semibold transition-all duration-200 border border-brand-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin h-5 w-5 border-b-2 border-white"></div>
                      <span>{settingsDict.saving || 'Saving...'}</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>{settingsDict.save || 'Save Settings'}</span>
                    </>
                  )}
                </button>
              </div>
          </div>
        </div>
      </div>
    </div>
  );
}

