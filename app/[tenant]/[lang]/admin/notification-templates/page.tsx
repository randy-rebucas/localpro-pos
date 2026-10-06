'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import NotificationTemplatesManager from '@/components/settings/NotificationTemplatesManager';
import { usePermissions } from '@/hooks/usePermissions';
import AdminPageHeader from '@/components/admin/AdminPageHeader';

export default function NotificationTemplatesPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { canAccess } = usePermissions();
  const canManage = canAccess('notifications.manage');

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

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
        title={dict.admin?.notificationTemplates || 'Notification Templates'}
        description={dict.admin?.notificationTemplatesDescription || 'Customize email and SMS templates for bookings, alerts, and notifications'}
      />

      <div className="space-y-4">
        {!canManage && (
          <div className="bg-brand-soft border border-brand p-4 text-sm text-brand-navy">
            {dict.notificationTemplates?.readOnlyNotice || "You don't have permission to change notification templates. Contact an admin or manager."}
          </div>
        )}
        <NotificationTemplatesManager tenant={tenant} canManage={canManage} dict={dict} />
      </div>
    </div>
  );
}
