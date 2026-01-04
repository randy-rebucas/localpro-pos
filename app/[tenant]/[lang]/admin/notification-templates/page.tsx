'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../dictionaries-client';
import NotificationTemplatesManager from '@/components/settings/NotificationTemplatesManager';
import { ITenantSettings } from '@/models/Tenant';

export default function NotificationTemplatesPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<ITenantSettings | null>(null);

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
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!dict || loading || !settings) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">{(dict?.common as Record<string, unknown>)?.loading as string || 'Loading...'}</p>
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
            {(dict?.common as Record<string, unknown>)?.back as string || 'Back'} to Admin
          </Link>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
            {(dict?.admin as Record<string, unknown>)?.notificationTemplates as string || 'Notification Templates'}
          </h1>
          <p className="text-gray-600">
            {(dict?.admin as Record<string, unknown>)?.notificationTemplatesDescription as string || 'Customize email and SMS templates for bookings, alerts, and notifications'}
          </p>
        </div>

        <div className="bg-white border border-gray-300 p-6">
          <NotificationTemplatesManager
            settings={settings}
            tenant={tenant}
            onUpdate={(updates) => {
              setSettings({ ...settings, ...updates });
            }}
          />
        </div>
      </div>
    </div>
  );
}
