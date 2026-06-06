'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { CheckCircle } from 'lucide-react';
import PageLoading from '@/components/ui/PageLoading';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
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

  const orderId = searchParams.get('orderId') || searchParams.get('token');

  const activateSubscription = useCallback(async () => {
    if (!orderId) {
      setActivating(false);
      setErrorMsg(dict?.subscription?.missingOrderId || 'Missing PayPal order ID.');
      return;
    }

    let planId: string | null = null;
    let billingCycle: string | null = null;
    const planData = localStorage.getItem('paypal_subscription_plan');
    if (planData) {
      const parsed = JSON.parse(planData);
      planId = parsed.planId;
      billingCycle = parsed.billingCycle;
    } else {
      planId = searchParams.get('planId');
      billingCycle = searchParams.get('billingCycle') || 'monthly';
    }

    if (!planId) {
      setErrorMsg(
        dict?.subscription?.missingPlanId ||
          'Plan ID not found. Please try selecting a plan again.'
      );
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
        }),
      });
      const data = await response.json();
      if (data.success) {
        setSuccess(true);
        setErrorMsg(null);
        localStorage.removeItem('paypal_subscription_plan');
        router.replace(`/${tenant}/${lang}/admin`);
        return;
      }
      setErrorMsg(data.error || 'Unknown backend error.');
    } catch (err) {
      console.error('Error activating subscription:', err);
      setErrorMsg(dict?.subscription?.activationFailedMessage || 'Activation failed.');
    } finally {
      setActivating(false);
    }
  }, [dict, lang, orderId, router, searchParams, tenant]);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    if (dict) {
      activateSubscription();
    }
  }, [dict, activateSubscription]);

  if (!dict) {
    return <PageLoading label="Loading..." />;
  }

  const subDict = dict.subscription ?? {};

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white border border-gray-300 p-8 text-center">
        {activating ? (
          <>
            <LoadingSpinner size="lg" className="mb-6" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {subDict.processingPayment || 'Processing Payment'}
            </h1>
            <p className="text-gray-500 text-sm">
              {subDict.activatingSubscription ||
                'Please wait while we activate your subscription...'}
            </p>
          </>
        ) : success ? (
          <>
            <div className="inline-flex p-4 border border-green-200 bg-green-50 mb-6">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {subDict.paymentSuccess || 'Payment Successful!'}
            </h1>
            <p className="text-gray-500 text-sm mb-8">
              {subDict.subscriptionActivated ||
                'Your subscription has been activated successfully.'}
            </p>
            <button
              type="button"
              onClick={() => router.push(`/${tenant}/${lang}/admin`)}
              className="w-full py-2 px-4 bg-brand text-white font-medium hover:bg-brand-hover transition-colors border border-brand-hover"
            >
              {dict.admin?.dashboard || 'Go to Dashboard'}
            </button>
          </>
        ) : (
          <ErrorState
            title={subDict.activationFailed || 'Activation Failed'}
            description={
              errorMsg ||
              subDict.activationFailedMessage ||
              'There was an issue activating your subscription. Please contact support.'
            }
            onRetry={activateSubscription}
            retryLabel={subDict.tryAgain || 'Try Again'}
            compact
          />
        )}
      </div>
    </div>
  );
}
