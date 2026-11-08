'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import StatusSlip, { StatusLoading, slipPrimaryKey, slipSecondaryKey } from '@/components/StatusSlip';
import { checkoutAmountCode, clearStoredCheckout, readStoredCheckout } from '@/components/subscription/storedCheckout';
import type { TranslationDict } from '@/types/dictionary';

export default function PaymentSuccessPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const [activating, setActivating] = useState(true);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Read before activation clears it
  const [amountCode] = useState(() => (typeof window === 'undefined' ? '--' : checkoutAmountCode(readStoredCheckout())));
  // Development runs effects twice; two captures of one order would race and
  // could report a failure for a payment that went through.
  const startedRef = useRef(false);

  const orderId = searchParams.get('orderId') || searchParams.get('token');

  const activateSubscription = useCallback(async () => {
    const subDict = dict?.subscription;
    setActivating(true);
    if (!orderId) {
      setActivating(false);
      setErrorMsg(subDict?.missingOrderId || 'Missing PayPal order ID.');
      return;
    }

    const stored = readStoredCheckout();
    const planId = stored?.planId ?? searchParams.get('planId');
    const billingCycle = stored?.billingCycle ?? (searchParams.get('billingCycle') || 'monthly');
    const couponCode = stored?.couponCode ?? null;

    if (!planId) {
      setErrorMsg(subDict?.missingPlanId || 'Plan ID not found. Please try selecting a plan again.');
      setActivating(false);
      return;
    }

    try {
      const response = await fetch('/api/subscriptions/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          planId,
          billingCycle,
          paypalOrderId: orderId,
          couponCode: couponCode || undefined,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setSuccess(true);
        setErrorMsg(null);
        clearStoredCheckout();
        router.replace(`/${tenant}/${lang}/admin`);
        return;
      }
      setErrorMsg(data.error || (subDict as Record<string, string | undefined> | undefined)?.unknownActivationError || 'Unknown backend error.');
    } catch (err) {
      console.error('Error activating subscription:', err);
      setErrorMsg(subDict?.activationFailedMessage || 'Activation failed.');
    } finally {
      setActivating(false);
    }
  }, [dict, lang, orderId, router, searchParams, tenant]);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    if (dict && !startedRef.current) {
      startedRef.current = true;
      activateSubscription();
    }
  }, [dict, activateSubscription]);

  const subDict = (dict?.subscription ?? {}) as Record<string, string | undefined>;

  if (!dict || activating) {
    return (
      <StatusLoading
        label={dict ? subDict.activatingSubscription || 'Please wait while we activate your subscription...' : 'Loading...'}
      />
    );
  }

  const dashboard = () => router.push(`/${tenant}/${lang}/admin`);

  if (success) {
    return (
      <StatusSlip
        code={amountCode}
        stamp={subDict.stampPaid || 'Paid'}
        title={subDict.paymentSuccess || 'Payment Successful!'}
        message={subDict.subscriptionActivated || 'Your subscription has been activated successfully.'}
      >
        <button type="button" onClick={dashboard} className={slipPrimaryKey}>
          {subDict.goToDashboard || 'Go to Dashboard'}
        </button>
      </StatusSlip>
    );
  }

  return (
    <StatusSlip
      code={amountCode}
      title={subDict.activationFailed || 'Activation Failed'}
      message={
        errorMsg ||
        subDict.activationFailedMessage ||
        'There was an issue activating your subscription. Please contact support.'
      }
    >
      <button type="button" onClick={activateSubscription} className={slipPrimaryKey}>
        {subDict.tryAgain || 'Try Again'}
      </button>
      <button type="button" onClick={dashboard} className={slipSecondaryKey}>
        {subDict.goToDashboard || 'Go to Dashboard'}
      </button>
    </StatusSlip>
  );
}
