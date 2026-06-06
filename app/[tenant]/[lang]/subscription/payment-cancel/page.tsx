'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { XCircle } from 'lucide-react';
import PageLoading from '@/components/ui/PageLoading';
import type { TranslationDict } from '@/types/dictionary';

export default function PaymentCancelPage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<TranslationDict | null>(null);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  if (!dict) {
    return <PageLoading label="Loading..." />;
  }

  const subDict = dict.subscription ?? {};

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white border border-gray-300 p-8 text-center">
        <div className="inline-flex p-4 border border-red-200 bg-red-50 mb-6">
          <XCircle className="h-10 w-10 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {subDict.paymentCancelled || 'Payment Cancelled'}
        </h1>
        <p className="text-gray-500 text-sm mb-8">
          {subDict.paymentCancelledMessage ||
            'Your payment was cancelled. No changes have been made to your subscription.'}
        </p>
        <button
          type="button"
          onClick={() => router.push(`/${tenant}/${lang}/subscription`)}
          className="w-full py-2 px-4 bg-brand text-white font-medium hover:bg-brand-hover transition-colors border border-brand-hover"
        >
          {subDict.backToSubscription || 'Back to Subscription'}
        </button>
      </div>
    </div>
  );
}
