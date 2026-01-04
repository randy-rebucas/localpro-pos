'use client';

import { useEffect, useState } from 'react';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';

/**
 * Component to set page title based on tenant settings
 */
export default function PageTitle() {
  const { settings } = useTenantSettings();
  const params = useParams();
  const lang = (params?.lang as 'en' | 'es') || 'en';
  const [dict, setDict] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);
  
  useEffect(() => {
    if (settings?.companyName) {
      document.title = `${settings.companyName} - 1POS`;
    } else {
      document.title = dict?.components?.pageTitle?.posSystem || '1POS - Point of Sale';
    }
  }, [settings?.companyName, dict]);

  return null;
}

