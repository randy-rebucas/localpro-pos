'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import TaxRulesManager from '@/components/settings/TaxRulesManager';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { RegisterPage } from '@/components/admin/register-ui';
import { getDictionaryClient } from '../../dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { usePermissions } from '@/hooks/usePermissions';

type Dict = Record<string, Record<string, string | undefined> | undefined>;

export default function TaxRulesAdminPage() {
  const params = useParams();
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<Dict | null>(null);
  // Settings come from TenantSettingsContext (already loaded by the layout); the rules load from /api/tax-rules.
  const { settings } = useTenantSettings();
  const { canAccess } = usePermissions();
  const canManage = canAccess('tax_rules.manage');

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

  const title = dict.admin?.taxRules || 'Tax Rules';
  const subtitle = dict.admin?.taxRulesSubtitle || 'Configure multiple tax rates based on region, product type, or category. Set priorities to control which rules apply.';

  if (!canManage) {
    return (
      <RegisterPage tagNo="TX" tag={settings.companyName} title={title}>
        <section className="mt-6 max-w-2xl">
          <div className="border-l-4 border-stamp bg-paper-white px-5 py-4 text-ink">
            <h2 className="text-3xl">{dict.admin?.accessRestricted || 'Access Restricted'}</h2>
            <p className="mt-2 text-sm">
              {dict.admin?.accessRestrictedTaxRules || "You don't have permission to manage tax rules. Contact an admin or owner."}
            </p>
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </section>
      </RegisterPage>
    );
  }

  return <TaxRulesManager settings={settings} dict={dict} header={{ tag: settings.companyName, title, subtitle }} />;
}
