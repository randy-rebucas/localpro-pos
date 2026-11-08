'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import HolidaysManager from '@/components/settings/HolidaysManager';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { getDictionaryClient } from '../../dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { usePermissions } from '@/hooks/usePermissions';

type Dict = Record<string, Record<string, string | undefined> | undefined>;

export default function HolidaysAdminPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<Dict | null>(null);
  // Settings come from TenantSettingsContext (already loaded by the layout); holidays load from their own endpoint.
  const { settings } = useTenantSettings();
  const { canAccess } = usePermissions();

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
    <HolidaysManager
      settings={settings}
      tenant={tenant}
      lang={lang}
      dict={dict}
      canManage={canAccess('holidays.manage')}
      header={{
        tag: settings.companyName,
        title: dict.admin?.holidayCalendar || 'Holiday Calendar',
        subtitle: dict.admin?.holidaysSubtitleShort || 'Days the shop closes. Closed days take no bookings.',
      }}
    />
  );
}
