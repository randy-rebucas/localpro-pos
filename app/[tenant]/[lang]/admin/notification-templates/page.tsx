'use client';

import { useEffect, useState } from 'react';
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
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-brand"></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="px-4 sm:px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {dict?.admin?.notificationTemplates || 'Notification Templates'}
          </h1>
          <p className="text-gray-600">
            {dict?.admin?.notificationTemplatesDescription || 'Customize email and SMS templates for bookings, alerts, and notifications'}
          </p>
        </div>

        <div className="bg-white border border-gray-300 p-6">
          <NotificationTemplatesManager
            settings={settings}
            tenant={tenant}
            dict={dict}
            onUpdate={(updates) => {
              updateSettings(updates);
            }}
          />
        </div>
      </div>
    </div>
  );
}
