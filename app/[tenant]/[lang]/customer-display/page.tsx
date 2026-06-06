'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Currency from '@/components/Currency';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import CustomerDisplayScreen from '@/components/customer-display/CustomerDisplayScreen';
import { getDictionaryClient } from '../dictionaries-client';
import {
  useCustomerDisplaySession,
  CUSTOMER_DISPLAY_POLLING,
  type SessionError,
} from '@/hooks/useCustomerDisplaySession';
import type { TranslationDict } from '@/types/dictionary';

function resolveSessionError(
  sessionError: SessionError,
  displayDict: Record<string, string | undefined>
): string {
  switch (sessionError.code) {
    case 'invalidSessionData':
      return displayDict.invalidSessionData || 'Invalid session data received';
    case 'sessionNotFound':
      return displayDict.sessionNotFound || 'Session not found. Please open this from the POS terminal.';
    case 'failedToConnect':
      return displayDict.failedToConnect || 'Failed to connect to server';
    case 'loadFailed':
      return `${displayDict.errorLoadingSession || 'Error loading session'}: ${sessionError.detail || ''}`;
    default:
      return displayDict.failedToConnect || 'Failed to connect to server';
  }
}

export default function CustomerDisplay() {
  const params = useParams();
  const searchParams = useSearchParams();
  const tenant = params.tenant as string;
  const lang = (params.lang as 'en' | 'es') || 'en';
  const sessionId = searchParams.get('session');

  const [dict, setDict] = useState<TranslationDict | null>(null);
  const { sessionData, status, error: sessionError, refetch } = useCustomerDisplaySession(sessionId);
  const [showPaymentScreen, setShowPaymentScreen] = useState(false);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    if (
      sessionData.cart.length > 0 &&
      sessionData.paymentStatus === 'pending' &&
      status === 'ready'
    ) {
      setShowPaymentScreen(true);
    }
  }, [sessionData.cart.length, sessionData.paymentStatus, status]);

  useEffect(() => {
    if (sessionData.paymentStatus === 'completed') {
      const timer = setTimeout(
        () => setShowPaymentScreen(false),
        CUSTOMER_DISPLAY_POLLING.COMPLETION_AUTO_RESET_MS
      );
      return () => clearTimeout(timer);
    }
  }, [sessionData.paymentStatus]);

  useEffect(() => {
    if (!showPaymentScreen) return;

    const idleTimer = setTimeout(() => {
      setShowPaymentScreen(false);
    }, CUSTOMER_DISPLAY_POLLING.PAYMENT_IDLE_TIMEOUT_MS);

    return () => clearTimeout(idleTimer);
  }, [showPaymentScreen]);

  if (!dict) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
        <LoadingSpinner size="lg" label="Loading..." color="#ffffff" className="[&_p]:text-white" />
      </div>
    );
  }

  const displayDict = dict.customerDisplay ?? {};

  if (!sessionId) {
    return (
      <CustomerDisplayScreen
        variant="no-session"
        title={displayDict.noSessionFound || 'No Session Found'}
        description={
          displayDict.noSessionMessage || 'Please open this page with a valid session ID'
        }
      />
    );
  }

  if (status === 'error' && sessionError) {
    return (
      <CustomerDisplayScreen
        variant="error"
        title={displayDict.connectionError || 'Connection Error'}
        description={resolveSessionError(sessionError, displayDict)}
        sessionId={sessionId}
        onRetry={() => {
          refetch();
        }}
        retryLabel={displayDict.retry || dict.common.retry || 'Retry'}
      />
    );
  }

  if (status === 'loading') {
    return (
      <CustomerDisplayScreen
        variant="loading"
        title={displayDict.loadingSession || 'Loading session...'}
      />
    );
  }

  if (sessionData.cart.length === 0 && sessionData.paymentStatus === 'pending') {
    return (
      <CustomerDisplayScreen
        variant="empty"
        title={displayDict.waitingForItems || 'Waiting for Items...'}
        description={displayDict.scanItemsToStart || 'Scan items to get started'}
      />
    );
  }

  if (sessionData.paymentStatus === 'completed') {
    return (
      <CustomerDisplayScreen
        variant="success"
        title={displayDict.thankYou || 'Thank You!'}
        description={displayDict.paymentComplete || 'Payment Complete'}
      >
        <p className="text-green-200 text-xl mt-4">
          {dict.common.total || 'Total'}: <Currency amount={sessionData.total} />
        </p>
      </CustomerDisplayScreen>
    );
  }

  return (
    <div className="w-screen h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex flex-col p-8 overflow-hidden">
      <div className="text-center mb-8 flex-shrink-0">
        <h1 className="text-6xl font-bold text-white mb-2">
          {displayDict.yourOrder || 'Your Order'}
        </h1>
        <p className="text-gray-400 text-xl" role="status">
          {displayDict.session || 'Session'}: {sessionId.substring(0, 8)}...
        </p>
      </div>

      <div className="flex-1 flex gap-8 min-h-0">
        <div className="flex-1 flex flex-col min-h-0">
          <div className="bg-gray-800 rounded-2xl p-8 border border-gray-700 flex-1 overflow-y-auto overscroll-contain">
            <h2 className="text-3xl font-bold text-white mb-6 flex-shrink-0">
              {displayDict.items || 'Items'}
            </h2>
            <div className="space-y-4 pr-2">
              {sessionData.cart.map((item) => (
                <div
                  key={item.productId}
                  className="bg-gray-700 rounded-xl p-6 flex justify-between items-center flex-shrink-0"
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-2xl font-semibold text-white truncate">{item.name}</p>
                    <p className="text-gray-400 text-lg">
                      {displayDict.qty || 'Qty'}: {item.quantity}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-3xl font-bold text-brand-muted">
                      <Currency amount={item.price * item.quantity} />
                    </p>
                    <p className="text-gray-400 text-sm">
                      <Currency amount={item.price} /> {dict.pos?.each || 'each'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-700 rounded-xl p-6 mt-4 border border-gray-600 flex-shrink-0">
            <div className="flex justify-between items-center mb-4">
              <p className="text-gray-300 text-xl">{dict.pos?.subtotal || 'Subtotal'}</p>
              <p className="text-2xl font-bold text-white">
                <Currency amount={sessionData.subtotal} />
              </p>
            </div>

            {sessionData.discount && (
              <div className="flex justify-between items-center mb-4 text-green-400">
                <p className="text-lg">
                  {sessionData.discount.name || sessionData.discount.code}
                </p>
                <p className="text-2xl font-bold">
                  -<Currency amount={sessionData.discount.amount} />
                </p>
              </div>
            )}

            {sessionData.taxAmount !== undefined && sessionData.taxAmount > 0 && (
              <div className="flex justify-between items-center mb-4 text-amber-300">
                <p className="text-lg">
                  {sessionData.taxLabel || displayDict.tax || 'Tax'}
                  {sessionData.taxRate ? ` (${sessionData.taxRate}%)` : ''}
                </p>
                <p className="text-2xl font-bold">
                  +<Currency amount={sessionData.taxAmount} />
                </p>
              </div>
            )}

            <div className="border-t border-gray-600 pt-4">
              <div className="flex justify-between items-center">
                <p className="text-gray-300 text-2xl font-semibold">
                  {dict.common.total || 'Total'}
                </p>
                <p className="text-4xl font-bold text-brand-muted">
                  <Currency amount={sessionData.total} />
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="w-96 flex flex-col gap-6 min-h-0">
          {showPaymentScreen && (
            <div className="bg-gradient-to-br from-brand to-brand-navy-deep p-8 border border-brand flex flex-col justify-between flex-1 min-h-0 overflow-y-auto">
              <div className="flex-shrink-0">
                <h2 className="text-4xl font-bold text-white mb-2">
                  {displayDict.readyToPay || 'Ready to Pay?'}
                </h2>
                <p className="text-white/75 text-lg">
                  {dict.common.total || 'Total'}:{' '}
                  <Currency amount={sessionData.total} className="text-4xl" />
                </p>
              </div>

              <div className="space-y-4 my-8 flex-1 flex flex-col justify-center">
                {(['cash', 'card', 'digital'] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => {
                      fetch(`/api/pos/session/${sessionId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          tenant,
                          action: 'update-payment-method',
                          data: { paymentMethod: method },
                        }),
                      });
                    }}
                    aria-label={`Pay with ${method}`}
                    className={`w-full py-6 bg-white font-bold text-2xl rounded-xl transition-colors flex items-center justify-center gap-3 ${
                      method === 'cash'
                        ? 'text-green-700 hover:bg-green-50'
                        : method === 'card'
                        ? 'text-brand-hover hover:bg-brand-soft'
                        : 'text-brand-navy hover:bg-brand-soft'
                    }`}
                  >
                    {method === 'cash' && (dict.pos?.cash || 'Cash')}
                    {method === 'card' && (dict.pos?.card || 'Card')}
                    {method === 'digital' && (displayDict.digitalNFC || 'Digital / NFC')}
                  </button>
                ))}
              </div>

              <p className="text-center text-white/75 text-lg flex-shrink-0">
                {displayDict.staffWillComplete || 'Staff will complete payment'}
              </p>
            </div>
          )}

          {sessionData.paymentStatus === 'processing' && (
            <div
              className="bg-gradient-to-br from-orange-600 to-orange-800 rounded-2xl p-8 border border-orange-500 flex flex-col justify-center items-center flex-1 min-h-0"
              role="status"
            >
              <LoadingSpinner
                size="lg"
                color="#ffffff"
                className="mb-6 [&>div]:border-white [&>div]:border-t-transparent [&>div]:border-4 [&>div]:h-24 [&>div]:w-24"
              />
              <h2 className="text-3xl font-bold text-white">
                {displayDict.processingPayment || 'Processing Payment...'}
              </h2>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
