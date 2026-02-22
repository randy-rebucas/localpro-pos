'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { CheckCircle } from 'lucide-react';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';

export default function PaymentSuccessPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [activating, setActivating] = useState(true);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { settings } = useTenantSettings();
  const tenantSettings = settings || getDefaultTenantSettings();
  const primaryColor = tenantSettings.primaryColor || '#2563eb';

  // Accept both 'orderId' and 'token' as PayPal order ID
  const orderId = searchParams.get('orderId') || searchParams.get('token');

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    activateSubscription();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const activateSubscription = async () => {
    if (!orderId) {
      setActivating(false);
      setErrorMsg('Missing PayPal order ID.');
      return;
    }

    let planId: string | null = null;
    let billingCycle: string | null = null;
    // Try to get plan data from localStorage
    const planData = localStorage.getItem('paypal_subscription_plan');
    if (planData) {
      const parsed = JSON.parse(planData);
      planId = parsed.planId;
      billingCycle = parsed.billingCycle;
    } else {
      // Fallback: get from URL
      planId = searchParams.get('planId');
      billingCycle = searchParams.get('billingCycle') || 'monthly';
    }
    if (!planId) {
      setErrorMsg('Plan ID not found in localStorage or URL.');
      setActivating(false);
      return;
    }

    try {
      // Activate the subscription
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
        // Instead of reload, redirect to dashboard
        router.replace(`/${tenant}/${lang}/admin`);
        return;
      } else {
        setErrorMsg(data.error || 'Unknown backend error.');
        throw new Error(data.error);
      }
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      console.error('Error activating subscription:', error);
    } finally {
      setActivating(false);
    }
  };

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
        {activating ? (
          <>
            <div className="inline-flex p-4 border mb-6" style={{ borderColor: primaryColor, background: `${primaryColor}11` }}>
              <div
                className="h-10 w-10 animate-spin rounded-full"
                style={{ borderTop: `2px solid ${primaryColor}`, borderRight: `2px solid ${primaryColor}`, borderBottom: '2px solid transparent', borderLeft: `2px solid ${primaryColor}` }}
              />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{dict?.subscription?.processingPayment || 'Processing Payment'}</h1>
            <p className="text-gray-500 text-sm">{dict?.subscription?.activatingSubscription || 'Please wait while we activate your subscription...'}</p>
          </>
        ) : success ? (
          <>
            <div className="inline-flex p-4 border border-green-200 bg-green-50 mb-6">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{dict?.subscription?.paymentSuccess || 'Payment Successful!'}</h1>
            <p className="text-gray-500 text-sm mb-8">{dict?.subscription?.subscriptionActivated || 'Your subscription has been activated successfully.'}</p>
            <button
              onClick={() => router.push(`/${tenant}/${lang}/admin`)}
              className="w-full py-2 px-4 text-white font-medium transition-opacity"
              style={{ background: primaryColor }}
            >
              {dict?.admin?.dashboard || 'Go to Dashboard'}
            </button>
          </>
        ) : (
          <>
            <div className="inline-flex p-4 border border-red-200 bg-red-50 mb-6">
              <svg className="h-10 w-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{dict?.subscription?.activationFailed || 'Activation Failed'}</h1>
            <p className="text-gray-500 text-sm mb-4">{dict?.subscription?.activationFailedMessage || 'There was an issue activating your subscription. Please contact support.'}</p>
            {errorMsg && (
              <div className="text-xs text-red-500 mb-6 break-all bg-red-50 p-3">{errorMsg}</div>
            )}
            <button
              onClick={() => router.push(`/${tenant}/${lang}/subscription`)}
              className="w-full py-2 px-4 text-white font-medium transition-opacity"
              style={{ background: primaryColor }}
            >
              {dict?.subscription?.tryAgain || 'Try Again'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}