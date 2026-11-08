'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import StatusSlip, { StatusLoading, slipPrimaryKey } from '@/components/StatusSlip';
import { checkoutAmountCode, readStoredCheckout } from '@/components/subscription/storedCheckout';
import type { TranslationDict } from '@/types/dictionary';

export default function PaymentCancelPage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<TranslationDict | null>(null);
  // Not shown until the dictionary loads, so the server's '--' never reaches the screen
  const [amountCode] = useState(() => (typeof window === 'undefined' ? '--' : checkoutAmountCode(readStoredCheckout())));

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  if (!dict) {
    return <StatusLoading label="Loading..." />;
  }

  const subDict = (dict.subscription ?? {}) as Record<string, string | undefined>;

  return (
    <StatusSlip
      code={amountCode}
      stamp={subDict.stampVoid || 'Void'}
      title={subDict.paymentCancelled || 'Payment Cancelled'}
      message={subDict.paymentCancelledMessage || 'Your payment was cancelled. No changes have been made to your subscription.'}
    >
      <button type="button" onClick={() => router.push(`/${tenant}/${lang}/subscription`)} className={slipPrimaryKey}>
        {subDict.backToSubscription || 'Back to Subscription'}
      </button>
    </StatusSlip>
  );
}
