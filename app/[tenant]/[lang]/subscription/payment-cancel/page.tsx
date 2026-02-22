'use client';

import { useParams, useRouter } from 'next/navigation';
import { XCircle } from 'lucide-react';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';

export default function PaymentCancelPage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const { settings } = useTenantSettings();
  const tenantSettings = settings || getDefaultTenantSettings();
  const primaryColor = tenantSettings.primaryColor || '#2563eb';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white border p-8 text-center" style={{ borderColor: primaryColor }}>
        <div className="inline-flex p-4 border border-red-200 bg-red-50 mb-6">
          <XCircle className="h-10 w-10 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Cancelled</h1>
        <p className="text-gray-500 text-sm mb-8">Your payment was cancelled. No changes have been made to your subscription.</p>
        <button
          onClick={() => router.push(`/${tenant}/${lang}/subscription`)}
          className="w-full py-2 px-4 text-white font-medium transition-opacity"
          style={{ background: primaryColor }}
        >
          Back to Subscription
        </button>
      </div>
    </div>
  );
}
