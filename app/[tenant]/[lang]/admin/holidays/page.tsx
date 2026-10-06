'use client';

import { useEffect, useState } from 'react';
import HolidaysManager from '@/components/settings/HolidaysManager';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { usePermissions } from '@/hooks/usePermissions';
import AdminPageHeader from '@/components/admin/AdminPageHeader';

export default function HolidaysAdminPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { canAccess } = usePermissions();
  const canCreate = canAccess('holidays.create');
  const canEdit = canAccess('holidays.edit');
  const canDelete = canAccess('holidays.delete');
  const canManage = canCreate || canEdit || canDelete;

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
        title={dict?.admin?.holidayCalendar || 'Holiday Calendar'}
        description={dict?.admin?.holidaysSubtitle || 'Manage holidays and recurring holidays. Mark holidays when the business is closed to affect booking availability.'}
      />

      <div className="space-y-4">
        {!canManage && (
          <div className="bg-brand-soft border border-brand p-4 text-sm text-brand-navy">
            {dict?.admin?.holidaysReadOnlyNotice || "You don't have permission to change holidays. Contact an admin or manager."}
          </div>
        )}

        {/* Each write control checks its own action; the list and Retry stay usable. */}
        <HolidaysManager tenant={tenant} dict={dict} canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} />
      </div>
    </div>
  );
}
