'use client';

import { useEffect, useState } from 'react';
import BusinessHoursManager from '@/components/settings/BusinessHoursManager';
import { useParams } from 'next/navigation';
import { showToast } from '@/lib/toast';
import { getDictionaryClient } from '../../dictionaries-client';
import { useBusinessHoursSettings } from '@/hooks/useBusinessHoursSettings';
import { usePermissions } from '@/hooks/usePermissions';
import AdminPageHeader from '@/components/admin/AdminPageHeader';

export default function BusinessHoursAdminPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { canAccess } = usePermissions();
  const canManage = canAccess('business_hours.manage');

  const { settings, loading, error, fetchSettings } = useBusinessHoursSettings(tenant);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-6">
      <AdminPageHeader
        title={dict.admin?.businessHours || 'Business Hours'}
        description={dict.admin?.businessHoursSubtitle || 'Configure weekly schedule, special hours, and break times. This affects booking availability and business operations.'}
      />

      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-12 bg-white border border-gray-300">
            <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
            <p className="mt-3 text-gray-400 text-sm">{dict.businessHours?.loadingBusinessHours || 'Loading business hours…'}</p>
          </div>
        ) : error || !settings ? (
          <div className="text-center py-12 bg-white border border-gray-300">
            <p className="text-win8-danger text-sm font-medium">
              {error || dict.businessHours?.failedToLoad || 'Failed to load business hours'}
            </p>
            <button
              onClick={fetchSettings}
              className="mt-4 inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
            >
              {dict.common?.retry || 'Retry'}
            </button>
          </div>
        ) : (
          <>
            {!canManage && (
              <div className="bg-brand-soft border border-brand p-4 text-sm text-brand-navy">
                {dict.businessHours?.readOnlyNotice || "You don't have permission to change business hours. Contact an admin or manager."}
              </div>
            )}
            <fieldset disabled={!canManage}>
              <BusinessHoursManager
                settings={settings}
                tenant={tenant}
                dict={dict}
                // The business-hours route persists timezone, schedule and
                // special hours itself; /settings drops `businessHours`
                // (see lib/tenant-settings-flatten.ts), so no second write.
                onUpdate={() => {
                  showToast.success(dict.businessHours?.savedSuccessfully || 'Business hours saved successfully');
                }}
              />
            </fieldset>
          </>
        )}
      </div>
    </div>
  );
}
