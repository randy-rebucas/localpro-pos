'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import HardwareStatusChecker from '@/components/HardwareStatus';
import HardwareSettings from '@/components/HardwareSettings';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../dictionaries-client';
import { ITenantSettings } from '@/models/Tenant';
import { hardwareService } from '@/lib/hardware';

export default function HardwareAdminPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<ITenantSettings | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/tenants/${tenant}/settings`);
      const data = await res.json();
      if (data.success) {
        const defaultSettings = {
          hardwareConfig: {},
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
        setMessage({ type: 'success', text: dict?.settings?.saved || 'Hardware settings saved successfully!' });
        setSettings(data.data);
        setTimeout(() => setMessage(null), 3000);
      } else {
        if (res.status === 401 || res.status === 403) {
          setMessage({ type: 'error', text: dict?.settings?.unauthorized || 'Unauthorized. Please login with admin account.' });
        } else {
          setMessage({ type: 'error', text: data.error || 'Failed to save hardware settings' });
        }
      }
    } catch (error) {
      console.error('Error saving hardware settings:', error);
      setMessage({ type: 'error', text: 'Failed to save hardware settings. Please check your connection.' });
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
            Back to Admin
          </Link>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
            Hardware Settings
          </h1>
          <p className="text-gray-600">
            Configure printers, barcode scanners, QR readers, cash drawers, and other hardware devices.
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-white border border-gray-300 p-5 sm:p-6 lg:p-8">
              <HardwareSettings 
                hideSaveButton={true}
                config={settings.hardwareConfig}
                onChange={(hardwareConfig) => {
                  setSettings({ ...settings, hardwareConfig });
                }}
              />
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
                      <span>{dict?.settings?.save || 'Save Hardware Settings'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
          <div className="lg:col-span-1">
            <HardwareStatusChecker showActions={false} autoRefresh={true} sidebar={true} />
          </div>
        </div>
      </div>
    </div>
  );
}
