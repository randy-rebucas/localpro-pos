'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { XCircle } from 'lucide-react';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';

export default function PaymentFailedPage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { settings } = useTenantSettings();
  const tenantSettings = settings || getDefaultTenantSettings();
  const primaryColor = tenantSettings.primaryColor || '#2563eb';

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
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{dict?.subscription?.paymentFailed || 'Payment Failed'}</h1>
        <p className="text-gray-500 text-sm mb-8">
          {dict?.subscription?.paymentFailedMessage || 'Your payment could not be processed. Please try again or contact support.'}
        </p>
        <div className="space-y-3">
          <button
            onClick={() => router.push(`/${tenant}/${lang}/subscription`)}
            className="w-full py-2 px-4 text-white font-medium transition-opacity"
            style={{ background: primaryColor }}
          >
            {dict?.subscription?.tryAgain || 'Try Again'}
          </button>
          <button
            onClick={() => router.push(`/${tenant}/${lang}/admin`)}
            className="w-full py-2 px-4 bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors"
          >
            {dict?.admin?.dashboard || 'Go to Dashboard'}
          </button>
        </div>
      </div>
    </div>
  );
}