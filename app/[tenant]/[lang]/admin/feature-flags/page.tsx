'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../dictionaries-client';
import { ITenantSettings } from '@/models/Tenant';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getBusinessTypeConfig } from '@/lib/business-types';
import { getBusinessType } from '@/lib/business-type-helpers';

export default function FeatureFlagsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<ITenantSettings | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const { settings: tenantSettings } = useTenantSettings();
  const businessTypeConfig = tenantSettings ? getBusinessTypeConfig(getBusinessType(tenantSettings)) : null;

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
        const defaultSettings = {
          enableInventory: true,
          enableCategories: true,
          enableDiscounts: false,
          enableLoyaltyProgram: false,
          enableCustomerManagement: false,
          enableBookingScheduling: false,
          ...data.data,
        };
        setSettings(defaultSettings);
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
        setMessage({ type: 'success', text: dict?.admin?.featureFlagsSavedSuccess || 'Feature flags saved successfully!' });
        setSettings(data.data);
        setTimeout(() => setMessage(null), 3000);
      } else {
        if (res.status === 401 || res.status === 403) {
          setMessage({ type: 'error', text: dict?.settings?.unauthorized || 'Unauthorized. Please login with admin account.' });
        } else {
          setMessage({ type: 'error', text: data.error || dict?.admin?.failedToSaveFeatureFlags || 'Failed to save feature flags' });
        }
      }
    } catch (error) {
      console.error('Error saving feature flags:', error);
      setMessage({ type: 'error', text: dict?.admin?.failedToSaveFeatureFlagsConnection || 'Failed to save feature flags. Please check your connection.' });
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
            <h2 className="text-xl font-bold text-red-800 mb-2">Failed to Load Settings</h2>
            <p className="text-red-700 mb-4">
              {message?.text || 'Unable to load tenant settings. Please check your connection and try again.'}
            </p>
            <button
              onClick={fetchSettings}
              className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 font-medium transition-colors border border-red-700"
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
          <Link
            href={`/${tenant}/${lang}/admin`}
            className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium mb-4 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {dict?.admin?.backToAdmin || 'Back to Admin'}
          </Link>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
            {dict?.admin?.featureFlags || 'Feature Flags'}
          </h1>
          <p className="text-gray-600">
            {dict?.admin?.featureFlagsSubtitle || 'Enable or disable system-wide features. Changes affect the entire application.'}
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

        {businessTypeConfig && (
          <div className="mb-6 p-4 bg-blue-50 border-2 border-blue-300">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 flex-shrink-0 mt-0.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="text-lg font-semibold text-blue-900 mb-2">
                  Current Business Type: {businessTypeConfig.name}
                </h3>
                <p className="text-blue-800 mb-2">
                  {businessTypeConfig.description}
                </p>
                <p className="text-sm text-blue-700">
                  Default features for this business type are auto-configured. You can override them below.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white border border-gray-300 p-5 sm:p-6 lg:p-8">
                <section>
                  <h2 className="text-xl font-bold text-gray-900 mb-5">{dict?.admin?.systemFeatures || 'System Features'}</h2>
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
                    {dict?.admin?.enableInventoryManagement || 'Enable Inventory Management'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {dict?.admin?.enableInventoryManagementDesc || 'Enable real-time stock tracking and inventory management'}
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
                    {dict?.admin?.enableCategories || 'Enable Categories'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {dict?.admin?.enableCategoriesDesc || 'Enable product categorization and organization'}
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
                    {dict?.admin?.enableDiscounts || 'Enable Discounts'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {dict?.admin?.enableDiscountsDesc || 'Enable discount codes and promotional pricing'}
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
                    {dict?.admin?.enableLoyaltyProgram || 'Enable Loyalty Program'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {dict?.admin?.enableLoyaltyProgramDesc || 'Enable customer loyalty points and rewards system'}
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
                    {dict?.admin?.enableCustomerManagement || 'Enable Customer Management'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {dict?.admin?.enableCustomerManagementDesc || 'Enable customer profiles and history tracking'}
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
                    {dict?.admin?.enableBookingScheduling || 'Enable Booking & Scheduling'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {dict?.admin?.enableBookingSchedulingDesc || 'Enable appointment booking and scheduling features for salons, cleaners, and service businesses'}
                  </div>
                </label>
              </div>
            </div>
          </section>

          {/* Save Button */}
          <div className="flex justify-end pt-6 mt-8 border-t border-gray-200">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-3 bg-blue-600 text-white hover:bg-blue-700 font-semibold transition-all duration-200 border border-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin h-5 w-5 border-b-2 border-white"></div>
                  <span>{dict?.settings?.saving || 'Saving...'}</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{dict?.admin?.saveFeatureFlags || 'Save Feature Flags'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
