'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { CheckCircle, Loader2 } from 'lucide-react';

export default function PaymentSuccessPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null);
  const [activating, setActivating] = useState(true);
  const [success, setSuccess] = useState(false);

  const orderId = searchParams.get('orderId');

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    activateSubscription();
  }, [lang]);

  const activateSubscription = async () => {
    if (!orderId) {
      setActivating(false);
      return;
    }

    try {
      // Extract plan information from localStorage or URL params
      const planData = localStorage.getItem('paypal_subscription_plan');
      if (!planData) {
        throw new Error('Plan data not found');
      }

      const { planId, billingCycle } = JSON.parse(planData);

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
        // Clear stored plan data
        localStorage.removeItem('paypal_subscription_plan');
        // Refresh subscription context
        window.location.reload();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Error activating subscription:', error);
      // Redirect to failure page
      router.push(`/${tenant}/${lang}/subscription/payment-failed`);
    } finally {
      setActivating(false);
    }
  };

  if (!dict) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        {activating ? (
          <>
            <Loader2 className="h-16 w-16 animate-spin mx-auto mb-4 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Processing Payment</h1>
            <p className="text-gray-600">Please wait while we activate your subscription...</p>
          </>
        ) : success ? (
          <>
            <CheckCircle className="h-16 w-16 mx-auto mb-4 text-green-600" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Successful!</h1>
            <p className="text-gray-600 mb-6">Your subscription has been activated successfully.</p>
            <button
              onClick={() => router.push(`/${tenant}/${lang}/admin`)}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 font-medium"
            >
              Go to Dashboard
            </button>
          </>
        ) : (
          <>
            <div className="text-red-600 mb-4">
              <svg className="h-16 w-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Activation Failed</h1>
            <p className="text-gray-600 mb-6">There was an issue activating your subscription. Please contact support.</p>
            <button
              onClick={() => router.push(`/${tenant}/${lang}/subscription`)}
              className="w-full bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 font-medium"
            >
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  );
}