'use client';

import { useEffect, useState } from 'react';
import AdminNavBar from '@/components/AdminNavBar';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../dictionaries-client';
import NotificationTemplatesManager from '@/components/settings/NotificationTemplatesManager';
import { useNotificationTemplatesSettings } from '@/hooks/useNotificationTemplatesSettings';

export default function NotificationTemplatesPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  const { settings, loading, fetchSettings, updateSettings } = useNotificationTemplatesSettings(tenant);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchSettings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, tenant]);

  if (!dict || loading || !settings) {
    return (
      <div className="bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50">
      <AdminNavBar />
      <div className="px-6 py-5">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900 mb-1">
            {dict?.admin?.notificationTemplates || 'Notification Templates'}
          </h1>
          <p className="text-gray-600">
            {dict?.admin?.notificationTemplatesDescription || 'Customize email and SMS templates for bookings, alerts, and notifications'}
          </p>
        </div>

        <div className="bg-white border border-gray-200 p-5">
          <NotificationTemplatesManager
            settings={settings}
            tenant={tenant}
            onUpdate={(updates) => {
              updateSettings(updates);
            }}
          />
        </div>
      </div>
    </div>
  );
}
