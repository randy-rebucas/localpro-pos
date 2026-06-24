'use client';

import { useEffect, useState } from 'react';
import TaxRulesManager from '@/components/settings/TaxRulesManager';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../dictionaries-client';
import { ITenantSettings } from '@/types/tenant';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';

export default function TaxRulesAdminPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<ITenantSettings | null>(null);
  const { settings: tenantSettings } = useTenantSettings();
  const primaryColor = (tenantSettings || getDefaultTenantSettings()).primaryColor || '#35979c';

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchSettings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, tenant]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/tenants/${tenant}/settings`);
      const data = await res.json();
      if (data.success) {
        setSettings(data.data);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!dict || loading || !settings) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-brand"></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="px-4 sm:px-6 py-6">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {dict?.admin?.taxRules || 'Tax Rules'}
          </h1>
          <p className="text-gray-600">
            {dict?.admin?.taxRulesSubtitle || 'Configure multiple tax rates based on region, product type, or category. Set priorities to control which rules apply.'}
          </p>
        </div>

        <div className="bg-white border border-gray-300 p-5 sm:p-6 lg:p-8">
          <TaxRulesManager
            settings={settings}
            tenant={tenant}
            primaryColor={primaryColor}
            dict={dict}
            onUpdate={(updates) => {
              setSettings({ ...settings, ...updates });
            }}
          />
        </div>
      </div>
    </div>
  );
}
