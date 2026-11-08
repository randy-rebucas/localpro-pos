'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { RegisterPage } from '@/components/admin/register-ui';
import { getDictionaryClient } from '../../dictionaries-client';
import NotificationTemplatesManager, { type TemplatesDict } from '@/components/settings/NotificationTemplatesManager';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { usePermissions } from '@/hooks/usePermissions';

export default function NotificationTemplatesPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<TemplatesDict | null>(null);
  const { settings } = useTenantSettings();
  const { canAccess } = usePermissions();
  // Saving needs notifications.manage; check it here so the page does not offer edits that fail.
  const canManage = canAccess('notifications.manage');

  useEffect(() => {
    getDictionaryClient(lang).then((d) => setDict(d as TemplatesDict));
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

  const title = dict.admin?.notificationTemplates || 'Notification Templates';

  return (
    <RegisterPage
      tagNo="NT"
      tag={settings.companyName}
      title={title}
      subtitle={dict.admin?.notificationTemplatesDescription || 'Customize email and SMS templates'}
    >
      {canManage ? (
        <NotificationTemplatesManager
          tenant={tenant}
          dict={dict}
          emailOn={!!settings.emailNotifications}
          smsOn={!!settings.smsNotifications}
          settingsHref={`/${tenant}/${lang}/settings?tab=notifications`}
        />
      ) : (
        <section className="mt-6 max-w-2xl">
          <div className="border-l-4 border-stamp bg-paper-white px-5 py-4 text-ink">
            <h2 className="text-3xl">{dict.admin?.accessRestricted || 'Access Restricted'}</h2>
            <p className="mt-2 text-sm">
              {dict.admin?.accessRestrictedNotificationTemplates || "You don't have permission to edit notification templates. Contact an admin or owner."}
            </p>
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </section>
      )}
    </RegisterPage>
  );
}
