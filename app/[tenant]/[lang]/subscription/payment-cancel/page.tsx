'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { XCircle } from 'lucide-react';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';

export default function PaymentCancelPage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { settings } = useTenantSettings();
  const tenantSettings = settings || getDefaultTenantSettings();
  const primaryColor = tenantSettings.primaryColor || '#35979c';

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  if (!dict) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div
          className="inline-block animate-spin h-8 w-8 rounded-full"
          style={{ borderTop: `2px solid ${primaryColor}`, borderRight: `2px solid ${primaryColor}`, borderBottom: '2px solid transparent', borderLeft: `2px solid ${primaryColor}` }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white border p-8 text-center" style={{ borderColor: primaryColor }}>
        <div className="inline-flex p-4 border border-red-200 bg-red-50 mb-6">
          <XCircle className="h-10 w-10 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{dict?.subscription?.paymentCancelled || 'Payment Cancelled'}</h1>
        <p className="text-gray-500 text-sm mb-8">{dict?.subscription?.paymentCancelledMessage || 'Your payment was cancelled. No changes have been made to your subscription.'}</p>
        <button
          onClick={() => router.push(`/${tenant}/${lang}/subscription`)}
          className="w-full py-2 px-4 text-white font-medium transition-opacity"
          style={{ background: primaryColor }}
        >
          {dict?.subscription?.backToSubscription || 'Back to Subscription'}
        </button>
      </div>
    </div>
  );
}
