'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import ProtectedRoute from '@/components/ProtectedRoute';
import HardwareStatusChecker from '@/components/HardwareStatus';
import HardwareSettings from '@/components/HardwareSettings';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '../dictionaries-client';
import { ITenantSettings } from '@/models/Tenant';
import { detectLocation, getCurrencySymbolForCode } from '@/lib/location-detection';
import { hardwareService } from '@/lib/hardware';
import { SUBSCRIPTION_PLANS } from '@/lib/subscription-plans';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';

export default function SettingsPage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<ITenantSettings | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectedInfo, setDetectedInfo] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'branding' | 'contact' | 'receipt' | 'business' | 'notifications' | 'hardware' | 'reset' | 'subscription'>('general');

  // Subscription info from context
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { subscription } = useTenantSettings();
  const plan = SUBSCRIPTION_PLANS.find(p => p.key === subscription?.plan);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchSettings();
  }, [lang, tenant]);

  // Sync hardware config to hardware service when settings change
  useEffect(() => {
    if (settings?.hardwareConfig) {
      hardwareService.setConfig(settings.hardwareConfig);
    }
  }, [settings?.hardwareConfig]);

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
      setMessage({ type: 'error', text: dict?.settings?.failedToDetect || 'Failed to detect location. Please set manually.' });
    } finally {
      setDetecting(false);
    }
  };

  // Auto-detect location on first load if settings are default
  useEffect(() => {
    if (settings && !loading && !detecting) {
      // Check if settings are using defaults (likely first time setup)
      const isDefault = settings.timezone === 'UTC' &&
        settings.currency === 'USD' &&
        settings.dateFormat === 'MM/DD/YYYY';

      if (isDefault) {
        autoDetectLocation();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, loading]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/tenants/${tenant}/settings`);
      const data = await res.json();
      if (data.success) {
        // Ensure all required fields exist with defaults
        const defaultSettings = {
          currency: 'USD',
          currencyPosition: 'before',
          dateFormat: 'MM/DD/YYYY',
          timeFormat: '12h',
          timezone: 'UTC',
          language: 'en',
          numberFormat: {
            decimalSeparator: '.',
            thousandsSeparator: ',',
            decimalPlaces: 2,
          },
          primaryColor: '#2563eb',
          receiptShowLogo: true,
          receiptShowAddress: true,
          receiptShowPhone: false,
          receiptShowEmail: false,
          taxEnabled: false,
          taxRate: 0,
          taxLabel: 'Tax',
          lowStockThreshold: 10,
          lowStockAlert: true,
          emailNotifications: false,
          smsNotifications: false,
          enableInventory: true,
          enableCategories: true,
          enableDiscounts: false,
          enableLoyaltyProgram: false,
          enableCustomerManagement: false,
          enableBookingScheduling: false,
          hardwareConfig: {},
          ...data.data,
        };
        setSettings(defaultSettings);
      } else {
        setMessage({ type: 'error', text: data.error || dict?.settings?.failedToLoad || 'Failed to load settings' });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      setMessage({ type: 'error', text: dict?.common?.failedToLoadSettings || 'Failed to load settings. Please check your connection.' });
      setLoading(false);
    } finally {
      setLoading(false);
    }
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
        credentials: 'include', // Include cookies for authentication
        body: JSON.stringify({ settings }),
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: dict?.settings?.saved || 'Settings saved successfully!' });
        setSettings(data.data);
      } else {
        if (res.status === 401 || res.status === 403) {
          setMessage({ type: 'error', text: dict?.settings?.unauthorized || 'Unauthorized. Please login with admin or manager account to save settings.' });
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

  const handleDetectLocation = async () => {
    await autoDetectLocation();
  };

  const updateSetting = (path: string, value: any) => {
    if (!settings) return;

    const keys = path.split('.');
    const newSettings = JSON.parse(JSON.stringify(settings)); // Deep clone
    let current: any = newSettings;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
    setSettings(newSettings);
  };

  // Add state for backup/restore/reset tab
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreResults, setRestoreResults] = useState<any>(null);
  const [resetResults, setResetResults] = useState<any>(null);

  if (!dict || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">{dict?.settings?.loading || 'Loading settings...'}</p>
        </div>
      </div>
    );
  }

  // If settings failed to load, show error but still render form with defaults
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
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
            {dict?.settings?.title || 'Store Settings'}
          </h1>
          <p className="text-gray-600">{dict?.settings?.subtitle || 'Configure your store preferences and branding'}</p>
        </div>

        {message && (
          <div
            className={`mb-6 p-4 border ${message.type === 'success'
                ? 'bg-green-50 text-green-800 border-green-300'
                : 'bg-red-50 text-red-800 border-red-300'
              }`}
          >
            {message.text}
          </div>
        )}

        <div className="bg-white border border-gray-300 overflow-hidden">
          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="flex overflow-x-auto" aria-label={dict?.common?.tabs || 'Tabs'}>
              <button
                onClick={() => setActiveTab('general')}
                className={`px-6 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === 'general'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                {dict?.settings?.tabs?.general || 'General'}
              </button>
              <button
                onClick={() => setActiveTab('branding')}
                className={`px-6 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === 'branding'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                {dict?.settings?.tabs?.branding || 'Branding'}
              </button>
              <button
                onClick={() => setActiveTab('contact')}
                className={`px-6 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === 'contact'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                {dict?.settings?.tabs?.contact || 'Contact'}
              </button>
              <button
                onClick={() => setActiveTab('receipt')}
                className={`px-6 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === 'receipt'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                {dict?.settings?.tabs?.receipt || 'Receipt'}
              </button>
              <button
                onClick={() => setActiveTab('business')}
                className={`px-6 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === 'business'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                {dict?.settings?.tabs?.business || 'Business'}
              </button>
              <button
                onClick={() => setActiveTab('notifications')}
                className={`px-6 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === 'notifications'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                {dict?.settings?.tabs?.notifications || 'Notifications'}
              </button>
              <button
                onClick={() => setActiveTab('hardware')}
                className={`px-6 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === 'hardware'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                {dict?.settings?.tabs?.hardware || 'Hardware'}
              </button>
              <button
                onClick={() => setActiveTab('reset')}
                className={`px-6 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === 'reset'
                    ? 'border-red-600 text-red-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                {dict?.settings?.tabs?.reset || 'Collection Reset'}
              </button>
              <button
                onClick={() => setActiveTab('subscription')}
                className={`px-6 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === 'subscription'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                Subscription
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
                    <h2 className="text-xl font-bold text-gray-900">Currency & Localization</h2>
                    <button
                      onClick={handleDetectLocation}
                      disabled={detecting}
                      className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 border border-blue-300"
                    >
                      {detecting ? (
                        <>
                          <div className="animate-spin h-4 w-4 border-b-2 border-blue-600"></div>
                          <span>{dict?.settings?.detecting || 'Detecting...'}</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>{dict?.settings?.detectLocation || 'Auto-Detect Location'}</span>
                        </>
                      )}
                    </button>
                  </div>
                  {detectedInfo && (
                    <div className="mb-5 p-3 bg-green-50 border-2 border-green-300 text-sm text-green-800">
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{detectedInfo}</span>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Currency Code
                      </label>
                      <input
                        type="text"
                        value={settings.currency || 'USD'}
                        onChange={(e) => {
                          const newCurrency = e.target.value.toUpperCase();
                          updateSetting('currency', newCurrency);
                          // Auto-update currency symbol when currency changes
                          const symbol = getCurrencySymbolForCode(newCurrency);
                          if (symbol !== newCurrency) {
                            updateSetting('currencySymbol', symbol);
                          }
                        }}
                        className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                        placeholder={dict?.settings?.currencyPlaceholder || 'USD'}
                        maxLength={3}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Currency Symbol
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={settings.currencySymbol || getCurrencySymbolForCode(settings.currency || 'USD')}
                          onChange={(e) => updateSetting('currencySymbol', e.target.value)}
                          className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                          placeholder="$"
                        />
                        {!settings.currencySymbol && (
                          <button
                            type="button"
                            onClick={() => updateSetting('currencySymbol', getCurrencySymbolForCode(settings.currency || 'USD'))}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-600 hover:text-blue-700 font-medium"
                            title={dict?.common?.autoFillSymbol || 'Auto-fill symbol'}
                          >
                            Auto
                          </button>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Currency Position
                      </label>
                      <select
                        value={settings.currencyPosition || 'before'}
                        onChange={(e) => updateSetting('currencyPosition', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                      >
                        <option value="before">Before amount ($100)</option>
                        <option value="after">After amount (100$)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Timezone
                      </label>
                      <input
                        type="text"
                        value={settings.timezone || 'UTC'}
                        onChange={(e) => updateSetting('timezone', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                        placeholder={dict?.settings?.timezonePlaceholder || 'America/New_York'}
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
                        Date Format
                      </label>
                      <select
                        value={settings.dateFormat || 'MM/DD/YYYY'}
                        onChange={(e) => updateSetting('dateFormat', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                      >
                        <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                        <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                        <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Time Format
                      </label>
                      <select
                        value={settings.timeFormat || '12h'}
                        onChange={(e) => updateSetting('timeFormat', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                      >
                        <option value="12h">12-hour (AM/PM)</option>
                        <option value="24h">24-hour</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Language
                      </label>
                      <select
                        value={settings.language || 'en'}
                        onChange={async (e) => {
                          const newLang = e.target.value as 'en' | 'es';
                          updateSetting('language', newLang);

                          // Save settings first
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
                                settings: { ...settings, language: newLang }
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
                        className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                      >
                        <option value="en">English</option>
                        <option value="es">Español</option>
                      </select>
                      <p className="mt-2 text-xs text-gray-500">
                        Changing language will save settings and reload the page
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Decimal Separator
                      </label>
                      <select
                        value={settings.numberFormat?.decimalSeparator || '.'}
                        onChange={(e) => updateSetting('numberFormat.decimalSeparator', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                      >
                        <option value=".">Period (.)</option>
                        <option value=",">Comma (,)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Thousands Separator
                      </label>
                      <select
                        value={settings.numberFormat?.thousandsSeparator || ','}
                        onChange={(e) => updateSetting('numberFormat.thousandsSeparator', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                      >
                        <option value=",">Comma (,)</option>
                        <option value=".">Period (.)</option>
                        <option value=" ">Space ( )</option>
                        <option value="">None</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Decimal Places
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="4"
                        value={settings.numberFormat?.decimalPlaces || 2}
                        onChange={(e) => updateSetting('numberFormat.decimalPlaces', parseInt(e.target.value) || 2)}
                        className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                      />
                    </div>
                  </div>
                </section>

                {/* Feature Flags */}
                <section>
                  <h2 className="text-xl font-bold text-gray-900 mb-5">Feature Flags</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center p-4 border-2 border-gray-300 hover:bg-gray-50 transition-colors">
                      <input
                        type="checkbox"
                        id="enableInventory"
                        checked={settings.enableInventory !== false}
                        onChange={(e) => updateSetting('enableInventory', e.target.checked)}
                        className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                      />
                      <label htmlFor="enableInventory" className="ml-3 flex-1">
                        <div className="text-sm font-medium text-gray-900">
                          Enable Inventory Management
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Enable real-time stock tracking and inventory management
                        </div>
                      </label>
                    </div>
                    <div className="flex items-center p-4 border-2 border-gray-300 hover:bg-gray-50 transition-colors">
                      <input
                        type="checkbox"
                        id="enableCategories"
                        checked={settings.enableCategories !== false}
                        onChange={(e) => updateSetting('enableCategories', e.target.checked)}
                        className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                      />
                      <label htmlFor="enableCategories" className="ml-3 flex-1">
                        <div className="text-sm font-medium text-gray-900">
                          Enable Categories
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Enable product categorization and organization
                        </div>
                      </label>
                    </div>
                    <div className="flex items-center p-4 border-2 border-gray-300 hover:bg-gray-50 transition-colors">
                      <input
                        type="checkbox"
                        id="enableDiscounts"
                        checked={settings.enableDiscounts || false}
                        onChange={(e) => updateSetting('enableDiscounts', e.target.checked)}
                        className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                      />
                      <label htmlFor="enableDiscounts" className="ml-3 flex-1">
                        <div className="text-sm font-medium text-gray-900">
                          Enable Discounts
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Enable discount codes and promotional pricing
                        </div>
                      </label>
                    </div>
                    <div className="flex items-center p-4 border-2 border-gray-300 hover:bg-gray-50 transition-colors">
                      <input
                        type="checkbox"
                        id="enableLoyaltyProgram"
                        checked={settings.enableLoyaltyProgram || false}
                        onChange={(e) => updateSetting('enableLoyaltyProgram', e.target.checked)}
                        className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                      />
                      <label htmlFor="enableLoyaltyProgram" className="ml-3 flex-1">
                        <div className="text-sm font-medium text-gray-900">
                          Enable Loyalty Program
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Enable customer loyalty points and rewards system
                        </div>
                      </label>
                    </div>
                    <div className="flex items-center p-4 border-2 border-gray-300 hover:bg-gray-50 transition-colors">
                      <input
                        type="checkbox"
                        id="enableCustomerManagement"
                        checked={settings.enableCustomerManagement || false}
                        onChange={(e) => updateSetting('enableCustomerManagement', e.target.checked)}
                        className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                      />
                      <label htmlFor="enableCustomerManagement" className="ml-3 flex-1">
                        <div className="text-sm font-medium text-gray-900">
                          Enable Customer Management
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Enable customer profiles and history tracking
                        </div>
                      </label>
                    </div>
                    <div className="flex items-center p-4 border-2 border-gray-300 hover:bg-gray-50 transition-colors">
                      <input
                        type="checkbox"
                        id="enableBookingScheduling"
                        checked={settings.enableBookingScheduling || false}
                        onChange={(e) => updateSetting('enableBookingScheduling', e.target.checked)}
                        className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                      />
                      <label htmlFor="enableBookingScheduling" className="ml-3 flex-1">
                        <div className="text-sm font-medium text-gray-900">
                          Enable Booking & Scheduling
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Enable appointment booking and scheduling features for salons, cleaners, and service businesses
                        </div>
                      </label>
                    </div>
                  </div>
                </section>

                {/* Tax Settings */}
                <section>
                  <h2 className="text-xl font-bold text-gray-900 mb-5">Tax Settings</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="taxEnabled"
                        checked={settings.taxEnabled || false}
                        onChange={(e) => updateSetting('taxEnabled', e.target.checked)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                      />
                      <label htmlFor="taxEnabled" className="ml-2 text-sm font-medium text-gray-700">
                        Enable Tax
                      </label>
                    </div>
                    {settings.taxEnabled && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Tax Rate (%)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={settings.taxRate || 0}
                            onChange={(e) => updateSetting('taxRate', parseFloat(e.target.value) || 0)}
                            className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Tax Label
                          </label>
                          <input
                            type="text"
                            value={settings.taxLabel || 'Tax'}
                            onChange={(e) => updateSetting('taxLabel', e.target.value)}
                            className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                            placeholder={dict?.settings?.taxNamePlaceholder || 'VAT, GST, Sales Tax'}
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
              <section>
                <h2 className="text-xl font-bold text-gray-900 mb-5">Branding</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Company Name
                    </label>
                    <input
                      type="text"
                      value={settings.companyName || ''}
                      onChange={(e) => updateSetting('companyName', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Logo URL
                    </label>
                    <input
                      type="url"
                      value={settings.logo || ''}
                      onChange={(e) => updateSetting('logo', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                      placeholder="https://example.com/logo.png"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Favicon URL
                    </label>
                    <input
                      type="url"
                      value={settings.favicon || ''}
                      onChange={(e) => updateSetting('favicon', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                      placeholder="https://example.com/favicon.ico"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Primary Color
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={settings.primaryColor || '#2563eb'}
                        onChange={(e) => updateSetting('primaryColor', e.target.value)}
                        className="h-10 w-20 border-2 border-gray-300 cursor-pointer bg-white"
                      />
                      <input
                        type="text"
                        value={settings.primaryColor || '#2563eb'}
                        onChange={(e) => updateSetting('primaryColor', e.target.value)}
                        className="flex-1 px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                        placeholder="#2563eb"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Secondary Color
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
                        className="flex-1 px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                        placeholder="#64748b"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Accent Color
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
                        className="flex-1 px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                        placeholder="#10b981"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Background Color
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
                        className="flex-1 px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                        placeholder="#ffffff"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Text Color
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
                        className="flex-1 px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                        placeholder="#111827"
                      />
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Contact Tab */}
            {activeTab === 'contact' && (
              <section>
                <h2 className="text-xl font-bold text-gray-900 mb-5">Contact Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={settings.email || ''}
                      onChange={(e) => updateSetting('email', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={settings.phone || ''}
                      onChange={(e) => updateSetting('phone', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
                    <input
                      type="text"
                      value={settings.address?.street || ''}
                      onChange={(e) => updateSetting('address.street', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                    <input
                      type="text"
                      value={settings.address?.city || ''}
                      onChange={(e) => updateSetting('address.city', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">State/Province</label>
                    <input
                      type="text"
                      value={settings.address?.state || ''}
                      onChange={(e) => updateSetting('address.state', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ZIP/Postal Code</label>
                    <input
                      type="text"
                      value={settings.address?.zipCode || ''}
                      onChange={(e) => updateSetting('address.zipCode', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                    <input
                      type="text"
                      value={settings.address?.country || ''}
                      onChange={(e) => updateSetting('address.country', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                    <input
                      type="url"
                      value={settings.website || ''}
                      onChange={(e) => updateSetting('website', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                      placeholder="https://example.com"
                    />
                  </div>
                </div>
              </section>
            )}

            {/* Receipt Tab */}
            {activeTab === 'receipt' && (
              <section>
                <h2 className="text-xl font-bold text-gray-900 mb-5">Receipt & Invoice Settings</h2>
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Receipt Header
                    </label>
                    <textarea
                      value={settings.receiptHeader || ''}
                      onChange={(e) => updateSetting('receiptHeader', e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                      placeholder={dict?.settings?.receiptHeaderPlaceholder || 'Custom header text to appear at the top of receipts'}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Receipt Footer
                    </label>
                    <textarea
                      value={settings.receiptFooter || ''}
                      onChange={(e) => updateSetting('receiptFooter', e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                      placeholder={dict?.settings?.receiptFooterPlaceholder || 'Custom footer text to appear at the bottom of receipts'}
                    />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Display Options</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center p-4 border-2 border-gray-300 hover:bg-gray-50 transition-colors">
                        <input
                          type="checkbox"
                          id="receiptShowLogo"
                          checked={settings.receiptShowLogo !== false}
                          onChange={(e) => updateSetting('receiptShowLogo', e.target.checked)}
                          className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                        />
                        <label htmlFor="receiptShowLogo" className="ml-3 text-sm font-medium text-gray-700">
                          Show Logo on Receipts
                        </label>
                      </div>
                      <div className="flex items-center p-4 border-2 border-gray-300 hover:bg-gray-50 transition-colors">
                        <input
                          type="checkbox"
                          id="receiptShowAddress"
                          checked={settings.receiptShowAddress !== false}
                          onChange={(e) => updateSetting('receiptShowAddress', e.target.checked)}
                          className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                        />
                        <label htmlFor="receiptShowAddress" className="ml-3 text-sm font-medium text-gray-700">
                          Show Address on Receipts
                        </label>
                      </div>
                      <div className="flex items-center p-4 border-2 border-gray-300 hover:bg-gray-50 transition-colors">
                        <input
                          type="checkbox"
                          id="receiptShowPhone"
                          checked={settings.receiptShowPhone || false}
                          onChange={(e) => updateSetting('receiptShowPhone', e.target.checked)}
                          className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                        />
                        <label htmlFor="receiptShowPhone" className="ml-3 text-sm font-medium text-gray-700">
                          Show Phone on Receipts
                        </label>
                      </div>
                      <div className="flex items-center p-4 border-2 border-gray-300 hover:bg-gray-50 transition-colors">
                        <input
                          type="checkbox"
                          id="receiptShowEmail"
                          checked={settings.receiptShowEmail || false}
                          onChange={(e) => updateSetting('receiptShowEmail', e.target.checked)}
                          className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                        />
                        <label htmlFor="receiptShowEmail" className="ml-3 text-sm font-medium text-gray-700">
                          Show Email on Receipts
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Business Tab */}
            {activeTab === 'business' && (
              <section>
                <h2 className="text-xl font-bold text-gray-900 mb-5">Business Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Business Type
                    </label>
                    <select
                      value={settings.businessType || ''}
                      onChange={(e) => updateSetting('businessType', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                    >
                      <option value="">Select business type</option>
                      <option value="Retail">Retail</option>
                      <option value="Restaurant">Restaurant</option>
                      <option value="Service">Service</option>
                      <option value="Salon">Salon</option>
                      <option value="Repair">Repair/Technician</option>
                      <option value="Contractor">Contractor</option>
                      <option value="Rental">Rental</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tax ID / EIN
                    </label>
                    <input
                      type="text"
                      value={settings.taxId || ''}
                      onChange={(e) => updateSetting('taxId', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
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
                      className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                      placeholder={dict?.settings?.registrationNumberPlaceholder || 'Business registration number'}
                    />
                  </div>
                </div>
              </section>
            )}

            {/* Notifications Tab */}
            {activeTab === 'notifications' && (
              <section>
                <h2 className="text-xl font-bold text-gray-900 mb-5">Notification Settings</h2>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Stock Alerts</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Low Stock Threshold
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={settings.lowStockThreshold || 10}
                          onChange={(e) => updateSetting('lowStockThreshold', parseInt(e.target.value) || 10)}
                          className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                        />
                        <p className="mt-2 text-xs text-gray-500">
                          Alert when stock falls below this quantity
                        </p>
                      </div>
                      <div className="flex items-center p-4 border-2 border-gray-300 hover:bg-gray-50 transition-colors">
                        <input
                          type="checkbox"
                          id="lowStockAlert"
                          checked={settings.lowStockAlert !== false}
                          onChange={(e) => updateSetting('lowStockAlert', e.target.checked)}
                          className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                        />
                        <label htmlFor="lowStockAlert" className="ml-3 flex-1">
                          <div className="text-sm font-medium text-gray-900">
                            Enable Low Stock Alerts
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Get notified when products fall below threshold
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Notification Channels</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center p-4 border-2 border-gray-300 hover:bg-gray-50 transition-colors">
                        <input
                          type="checkbox"
                          id="emailNotifications"
                          checked={settings.emailNotifications || false}
                          onChange={(e) => updateSetting('emailNotifications', e.target.checked)}
                          className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                        />
                        <label htmlFor="emailNotifications" className="ml-3 flex-1">
                          <div className="text-sm font-medium text-gray-900">
                            Enable Email Notifications
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Receive notifications via email
                          </div>
                        </label>
                      </div>
                      <div className="flex items-center p-4 border-2 border-gray-300 hover:bg-gray-50 transition-colors">
                        <input
                          type="checkbox"
                          id="smsNotifications"
                          checked={settings.smsNotifications || false}
                          onChange={(e) => updateSetting('smsNotifications', e.target.checked)}
                          className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                        />
                        <label htmlFor="smsNotifications" className="ml-3 flex-1">
                          <div className="text-sm font-medium text-gray-900">
                            Enable SMS Notifications
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Receive notifications via SMS
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Hardware Tab */}
            {activeTab === 'hardware' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <HardwareSettings
                    hideSaveButton={true}
                    config={settings.hardwareConfig}
                    onChange={(hardwareConfig) => updateSetting('hardwareConfig', hardwareConfig)}
                  />
                </div>
                <div className="lg:col-span-1">
                  <HardwareStatusChecker showActions={false} autoRefresh={true} sidebar={true} />
                </div>
              </div>
            )}

            {/* Collection Reset Tab */}
            {activeTab === 'reset' && (
              <section>
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Collection Backup & Reset</h2>
                  <p className="text-sm text-gray-600 mb-4">
                    Backup your data before resetting. Warning: Reset action will permanently delete all data in the selected collections for this tenant. This cannot be undone.
                  </p>
                </div>

                {/* Backup Section */}
                <div className="mb-8 p-5 bg-blue-50 border-2 border-blue-300">
                  <h3 className="text-lg font-semibold text-blue-900 mb-3">Backup Collections</h3>
                  <p className="text-sm text-blue-800 mb-4">
                    Export selected collections as a JSON backup file. You can restore this backup later.
                  </p>

                  <div className="flex items-center gap-4">
                    <button
                      onClick={async () => {
                        if (selectedCollections.length === 0) {
                          setMessage({ type: 'error', text: dict?.common?.selectAtLeastOneCollection || 'Please select at least one collection to backup.' });
                          return;
                        }

                        try {
                          setBackingUp(true);
                          setMessage(null);

                          const collectionsParam = selectedCollections.join(',');
                          const url = `/api/tenants/${tenant}/reset-collections?collections=${collectionsParam}`;

                          const res = await fetch(url, {
                            method: 'GET',
                            credentials: 'include',
                          });

                          if (!res.ok) {
                            const data = await res.json();
                            if (res.status === 401 || res.status === 403) {
                              setMessage({ type: 'error', text: dict?.common?.unauthorizedBackup || 'Unauthorized. Only admins can backup collections.' });
                            } else {
                              setMessage({ type: 'error', text: data.error || dict?.common?.failedToCreateBackup || 'Failed to create backup' });
                            }
                            return;
                          }

                          // Download the file
                          const blob = await res.blob();
                          const downloadUrl = window.URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = downloadUrl;
                          a.download = `backup-${tenant}-${new Date().toISOString().split('T')[0]}.json`;
                          document.body.appendChild(a);
                          a.click();
                          window.URL.revokeObjectURL(downloadUrl);
                          document.body.removeChild(a);

                          setMessage({ type: 'success', text: `Backup created successfully for ${selectedCollections.length} collection(s)` });
                        } catch (error) {
                          console.error('Error creating backup:', error);
                          setMessage({ type: 'error', text: dict?.common?.failedToCreateBackup || 'Failed to create backup. Please check your connection.' });
                        } finally {
                          setBackingUp(false);
                        }
                      }}
                      disabled={backingUp || selectedCollections.length === 0}
                      className="px-6 py-3 bg-blue-600 text-white hover:bg-blue-700 font-semibold transition-all duration-200 border border-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {backingUp ? (
                        <>
                          <div className="animate-spin h-5 w-5 border-b-2 border-white"></div>
                          <span>Creating Backup...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"></svg>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          <span>Download Backup</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Restore Section */}
                <div className="mb-8 p-5 bg-green-50 border-2 border-green-300">
                  <h3 className="text-lg font-semibold text-green-900 mb-3">Restore Collections</h3>
                  <p className="text-sm text-green-800 mb-4">
                    Upload a backup JSON file to restore collections. You can choose to clear existing data before restoring.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-green-900 mb-2">
                        Select Backup File
                      </label>
                      <input
                        type="file"
                        accept=".json"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setRestoreFile(file);
                            setRestoreResults(null);
                          }
                        }}
                        className="w-full px-4 py-2 border-2 border-green-300 focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all bg-white"
                      />
                    </div>

                    {restoreFile && (
                      <div className="p-3 bg-white border border-green-300">
                        <p className="text-sm text-green-800">
                          <span className="font-medium">Selected:</span> {restoreFile.name} ({(restoreFile.size / 1024).toFixed(2)} KB)
                        </p>
                      </div>
                    )}

                    {restoreResults && (
                      <div className="p-4 bg-white border-2 border-green-300">
                        <h4 className="font-semibold text-green-900 mb-2">Restore Results:</h4>
                        <ul className="space-y-1">
                          {Object.entries(restoreResults).map(([collection, result]) => (
                            <li key={collection} className="text-sm text-green-800">
                              <span className="font-medium capitalize">{collection.replace(/([A-Z])/g, ' $1').trim()}:</span> {result.restored} record(s) restored
                              {result.cleared > 0 && `, ${result.cleared} cleared`}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex items-center gap-4">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          id="clearExisting"
                          className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 cursor-pointer"
                        />
                        <span className="ml-2 text-sm font-medium text-green-900">
                          Clear existing data before restoring
                        </span>
                      </label>
                    </div>

                    <button
                      onClick={async () => {
                        if (!restoreFile) {
                          setMessage({ type: 'error', text: dict?.common?.selectBackupFile || 'Please select a backup file to restore.' });
                          return;
                        }

                        const clearExisting = (document.getElementById('clearExisting') as HTMLInputElement)?.checked || false;

                        if (clearExisting && !confirm(
                          dict?.common?.clearExistingDataConfirm ||
                          'Are you sure you want to clear existing data before restoring?\n\n' +
                          'This will delete all current data in the collections being restored!'
                        )) {
                          return;
                        }

                        try {
                          setRestoring(true);
                          setMessage(null);
                          setRestoreResults(null);

                          const fileContent = await restoreFile.text();
                          let backupData;
                          try {
                            backupData = JSON.parse(fileContent);
                          } catch (e) {
                            setMessage({ type: 'error', text: dict?.common?.invalidBackupFormat || 'Invalid backup file format. Please select a valid JSON backup file.' });
                            return;
                          }

                          if (!backupData.collections) {
                            setMessage({ type: 'error', text: dict?.common?.invalidBackupFile || 'Invalid backup file. Missing collections data.' });
                            return;
                          }

                          const res = await fetch(`/api/tenants/${tenant}/reset-collections`, {
                            method: 'PUT',
                            headers: {
                              'Content-Type': 'application/json',
                            },
                            credentials: 'include',
                            body: JSON.stringify({ backupData, clearExisting }),
                          });

                          const data = await res.json();
                          if (data.success) {
                            setMessage({ type: 'success', text: data.data.message });
                            setRestoreResults(data.data.results);
                            setRestoreFile(null);
                            // Reset file input
                            const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
                            if

