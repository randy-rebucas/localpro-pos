'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../dictionaries-client';
import { ITenantSettings } from '@/models/Tenant';
import { detectLocation, getCurrencySymbolForCode } from '@/lib/location-detection';

export default function SettingsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<ITenantSettings | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectedInfo, setDetectedInfo] = useState<string | null>(null);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchSettings();
  }, [lang, tenant]);

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
      setMessage({ type: 'error', text: 'Failed to detect location. Please set manually.' });
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
          enableInventory: true,
          enableCategories: true,
          ...data.data,
        };
        setSettings(defaultSettings);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to load settings' });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      setMessage({ type: 'error', text: 'Failed to load settings. Please check your connection.' });
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
        setMessage({ type: 'success', text: 'Settings saved successfully!' });
        setSettings(data.data);
      } else {
        if (res.status === 401 || res.status === 403) {
          setMessage({ type: 'error', text: 'Unauthorized. Please login with admin or manager account to save settings.' });
        } else {
          setMessage({ type: 'error', text: data.error || 'Failed to save settings' });
        }
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: 'Failed to save settings. Please check your connection.' });
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

  if (!dict || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading settings...</p>
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
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-xl font-bold text-red-800 mb-2">Failed to Load Settings</h2>
            <p className="text-red-700 mb-4">
              {message?.text || 'Unable to load tenant settings. Please check your connection and try again.'}
            </p>
            <button
              onClick={fetchSettings}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
            >
              Retry
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
            Store Settings
          </h1>
          <p className="text-gray-600">Configure your store preferences and branding</p>
        </div>

        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-md p-6 space-y-8">
          {/* Currency & Localization */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Currency & Localization</h2>
              <button
                onClick={handleDetectLocation}
                disabled={detecting}
                className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {detecting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    <span>Detecting...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Auto-Detect Location</span>
                  </>
                )}
              </button>
            </div>
            {detectedInfo && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="USD"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    placeholder="$"
                  />
                  {!settings.currencySymbol && (
                    <button
                      type="button"
                      onClick={() => updateSetting('currencySymbol', getCurrencySymbolForCode(settings.currency || 'USD'))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-600 hover:text-blue-700"
                      title="Auto-fill symbol"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="America/New_York"
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
                <p className="mt-1 text-xs text-gray-500">
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                >
                  <option value="12h">12-hour (AM/PM)</option>
                  <option value="24h">24-hour</option>
                </select>
              </div>
            </div>
          </section>

          {/* Branding */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Branding</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company Name
                </label>
                <input
                  type="text"
                  value={settings.companyName || ''}
                  onChange={(e) => updateSetting('companyName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="https://example.com/logo.png"
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
                    className="h-10 w-20 border border-gray-300 rounded-md cursor-pointer"
                  />
                  <input
                    type="text"
                    value={settings.primaryColor || '#2563eb'}
                    onChange={(e) => updateSetting('primaryColor', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
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
                    className="h-10 w-20 border border-gray-300 rounded-md cursor-pointer"
                  />
                  <input
                    type="text"
                    value={settings.secondaryColor || ''}
                    onChange={(e) => updateSetting('secondaryColor', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    placeholder="#64748b"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Contact Information */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Contact Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={settings.email || ''}
                  onChange={(e) => updateSetting('email', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={settings.phone || ''}
                  onChange={(e) => updateSetting('phone', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
                <input
                  type="text"
                  value={settings.address?.street || ''}
                  onChange={(e) => updateSetting('address.street', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input
                  type="text"
                  value={settings.address?.city || ''}
                  onChange={(e) => updateSetting('address.city', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State/Province</label>
                <input
                  type="text"
                  value={settings.address?.state || ''}
                  onChange={(e) => updateSetting('address.state', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ZIP/Postal Code</label>
                <input
                  type="text"
                  value={settings.address?.zipCode || ''}
                  onChange={(e) => updateSetting('address.zipCode', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                <input
                  type="text"
                  value={settings.address?.country || ''}
                  onChange={(e) => updateSetting('address.country', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </section>

          {/* Tax Settings */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Tax Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="taxEnabled"
                  checked={settings.taxEnabled || false}
                  onChange={(e) => updateSetting('taxEnabled', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      placeholder="VAT, GST, Sales Tax"
                    />
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Save Button */}
          <div className="flex justify-end pt-6 border-t">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

