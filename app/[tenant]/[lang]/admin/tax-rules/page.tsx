'use client';

import { useEffect, useState } from 'react';
import TaxRulesManager from '@/components/settings/TaxRulesManager';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { usePermissions } from '@/hooks/usePermissions';
import AdminPageHeader from '@/components/admin/AdminPageHeader';

export default function TaxRulesAdminPage() {
  const params = useParams();
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { canAccess } = usePermissions();
  const canCreate = canAccess('tax_rules.create');
  const canEdit = canAccess('tax_rules.edit');
  const canDelete = canAccess('tax_rules.delete');
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
        title={dict.admin?.taxRules || 'Tax Rules'}
        description={dict.admin?.taxRulesSubtitle || 'Configure multiple tax rates based on region, product type, or category. Set priorities to control which rules apply.'}
      />

      <div className="space-y-4">
        {!canManage && (
          <div className="bg-brand-soft border border-brand p-4 text-sm text-brand-navy">
            {dict.taxRules?.readOnlyNotice || "You don't have permission to change tax rules. Contact an admin or manager."}
          </div>
        )}
        <TaxRulesManager canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} dict={dict} />
      </div>
    </div>
  );
}
