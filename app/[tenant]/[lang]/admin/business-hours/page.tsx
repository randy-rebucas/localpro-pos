'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import BusinessHoursManager from '@/components/settings/BusinessHoursManager';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { getDictionaryClient } from '../../dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { usePermissions } from '@/hooks/usePermissions';

type Dict = Record<string, Record<string, string | undefined> | undefined>;

export default function BusinessHoursAdminPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<Dict | null>(null);
  // Settings come from TenantSettingsContext (loaded by the layout). The manager saves through
  // /business-hours and only merges the result here; it no longer PUTs the same hours to /settings too.
  const { settings, applySettings } = useTenantSettings();
  const { canAccess } = usePermissions();
  const canManage = canAccess('business_hours.manage');

  useEffect(() => {
    getDictionaryClient(lang).then((d) => setDict(d as unknown as Dict));
  }, [lang]);

  if (!dict || !settings) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  return (
    <BusinessHoursManager
      settings={settings}
      tenant={tenant}
      dict={dict}
      canManage={canManage}
      header={{
        tag: settings.companyName,
        title: dict.admin?.businessHours || 'Business Hours',
        subtitle: dict.admin?.businessHoursSubtitleShort || 'Your weekly opening hours and the dates they change. Customers can only book within them.',
      }}
      onSaved={(hours) => applySettings({ businessHours: hours } as Parameters<typeof applySettings>[0])}
    />
  );
}
