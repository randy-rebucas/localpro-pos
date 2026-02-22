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
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);
  
  useEffect(() => {
    if (settings?.companyName) {
      document.title = `${settings.companyName} - POS System`;
    } else {
      document.title = dict?.components?.pageTitle?.posSystem || 'POS System - Point of Sale';
    }
  }, [settings?.companyName, dict]);

  return null;
}

