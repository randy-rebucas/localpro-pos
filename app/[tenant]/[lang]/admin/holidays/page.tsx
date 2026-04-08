'use client';

import { useEffect, useState } from 'react';
import AdminNavBar from '@/components/AdminNavBar';
import HolidaysManager from '@/components/settings/HolidaysManager';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../dictionaries-client';
import { useHolidaysSettings } from '@/hooks/useHolidaysSettings';

export default function HolidaysAdminPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  const { settings, loading, fetchSettings, updateSettings } = useHolidaysSettings(tenant);

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
        <div className="mb-5">
          <h1 className="text-xl font-bold text-gray-900 mb-1">
            {dict?.admin?.holidayCalendar || 'Holiday Calendar'}
          </h1>
          <p className="text-gray-600">
            {dict?.admin?.holidaysSubtitle || 'Manage holidays and recurring holidays. Mark holidays when the business is closed to affect booking availability.'}
          </p>
        </div>

        <div className="bg-white border border-gray-200 p-5">
          <HolidaysManager
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
