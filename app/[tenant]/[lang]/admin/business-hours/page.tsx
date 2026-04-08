'use client';

import { useEffect, useState } from 'react';
import AdminNavBar from '@/components/AdminNavBar';
import BusinessHoursManager from '@/components/settings/BusinessHoursManager';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { getDictionaryClient } from '../../dictionaries-client';
import { useBusinessHoursSettings } from '@/hooks/useBusinessHoursSettings';

export default function BusinessHoursAdminPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  const { settings, loading, fetchSettings, updateSettings } = useBusinessHoursSettings(tenant);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

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
            {dict?.admin?.businessHours || 'Business Hours'}
          </h1>
          <p className="text-gray-600">
            {dict?.admin?.businessHoursSubtitle || 'Configure weekly schedule, special hours, and break times. This affects booking availability and business operations.'}
          </p>
        </div>

        <div className="bg-white border border-gray-200 p-5">
          <BusinessHoursManager
            settings={settings}
            tenant={tenant}
            onUpdate={(updates) => {
              updateSettings(
                updates,
                () => {
                  toast.success(dict?.admin?.businessHoursUpdated || 'Business hours updated successfully');
                },
                (error) => {
                  toast.error(error || dict?.admin?.updateBusinessHoursError || 'Failed to update business hours');
                }
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}
