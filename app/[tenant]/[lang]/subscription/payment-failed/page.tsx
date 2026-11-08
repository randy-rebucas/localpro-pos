'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import StatusSlip, { StatusLoading, slipPrimaryKey, slipSecondaryKey } from '@/components/StatusSlip';
import { checkoutAmountCode, readStoredCheckout } from '@/components/subscription/storedCheckout';
import type { TranslationDict } from '@/types/dictionary';

export default function PaymentFailedPage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<TranslationDict | null>(null);
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
      stamp={subDict.stampDeclined || 'Declined'}
      title={subDict.paymentFailed || 'Payment Failed'}
      message={subDict.paymentFailedMessage || 'Your payment could not be processed. Please try again or contact support.'}
    >
      <button type="button" onClick={() => router.push(`/${tenant}/${lang}/subscription`)} className={slipPrimaryKey}>
        {subDict.tryAgain || 'Try Again'}
      </button>
      <button type="button" onClick={() => router.push(`/${tenant}/${lang}/admin`)} className={slipSecondaryKey}>
        {subDict.goToDashboard || 'Go to Dashboard'}
      </button>
    </StatusSlip>
  );
}
