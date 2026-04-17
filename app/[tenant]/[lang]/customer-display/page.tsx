'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Currency from '@/components/Currency';
import { getDictionaryClient } from '../dictionaries-client';

interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

interface SessionData {
  cart: CartItem[];
  subtotal: number;
  discount: { code: string; amount: number; name?: string } | null;
  taxAmount?: number;
  taxRate?: number;
  taxLabel?: string;
  tip: number;
  total: number;
  paymentMethod: string | null;
  paymentStatus: 'pending' | 'processing' | 'completed' | 'failed';
}

const POLLING_CONFIG = {
  BASE_INTERVAL_MS: 1000,
  BACKOFF_INCREMENT_MS: 100,
  MAX_INTERVAL_MS: 5000,
  RETRY_LIMIT: 10,
  COMPLETION_AUTO_RESET_MS: 5000,
  PAYMENT_IDLE_TIMEOUT_MS: 120000,
} as const;

function isValidSessionData(data: unknown): data is SessionData {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    Array.isArray(obj.cart) &&
    typeof obj.subtotal === 'number' &&
    (obj.discount === null || (typeof obj.discount === 'object' && 'code' in obj.discount)) &&
    typeof obj.tip === 'number' &&
    typeof obj.total === 'number' &&
    (obj.taxAmount === undefined || typeof obj.taxAmount === 'number') &&
    (obj.taxRate === undefined || typeof obj.taxRate === 'number') &&
    (obj.taxLabel === undefined || typeof obj.taxLabel === 'string')
  );
}

export default function CustomerDisplay() {
  const params = useParams();
  const searchParams = useSearchParams();
  const tenant = params.tenant as string;
  const lang = (params.lang as 'en' | 'es') || 'en';
  const sessionId = searchParams.get('session');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [dict, setDict] = useState<any>(null);

  const [sessionData, setSessionData] = useState<SessionData>({
    cart: [],
    subtotal: 0,
    discount: null,
    tip: 0,
    total: 0,
    paymentMethod: null,
    paymentStatus: 'pending',
  });

  const [showPaymentScreen, setShowPaymentScreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  // Shorthand translation helper
  const t = (path: string, fallback: string): string => {
    if (!dict) return fallback;
    const keys = path.split('.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let value: any = dict;
    for (const key of keys) {
      value = value?.[key];
      if (value === undefined) return fallback;
    }
    return value || fallback;
  };

  // Cleanup AbortController on unmount
  useEffect(() => {
    abortControllerRef.current = new AbortController();
    return () => abortControllerRef.current?.abort();
  }, []);

  // Reset retry count when sessionId changes to prevent unbounded growth
  useEffect(() => {
    setRetryCount(0);
    setError(null);
  }, [sessionId]);

  // Fetch session data
  const fetchSession = useCallback(async () => {
    if (!sessionId || !abortControllerRef.current) return;

    try {
      const res = await fetch(`/api/pos/session/${sessionId}`, {
        signal: abortControllerRef.current.signal,
      });
      if (res.ok) {
        const data = await res.json();

        // Validate response shape before updating state
        if (!isValidSessionData(data.data)) {
          console.error('Invalid session data structure:', data.data);
          setError(t('customerDisplay.invalidSessionData', 'Invalid session data received'));
          return;
        }

        setSessionData(data.data);
        setError(null);
        setRetryCount(0);

        // Auto show payment screen when cart is not empty
        if (data.data.cart.length > 0 && data.data.paymentStatus === 'pending') {
          setShowPaymentScreen(true);
        }
      } else if (res.status === 404) {
        // Session not ready yet or was cleared - keep retrying with patience
        setRetryCount((prev) => prev + 1);
        // Only show error if we've been retrying for a while (more than RETRY_LIMIT attempts)
        if (retryCount > POLLING_CONFIG.RETRY_LIMIT) {
          setError(t('customerDisplay.sessionNotFound', 'Session not found. Please open this from the POS terminal.'));
          console.error('Session not found after retries:', sessionId, 'attempts:', retryCount);
        } else {
          // Keep loading state while retrying
          if (!loading) {
            console.warn(`Session polling: attempt ${retryCount + 1}, waiting for session...`, sessionId);
          }
        }
      } else {
        setError(`${t('customerDisplay.errorLoadingSession', 'Error loading session')}: ${res.status}`);
        console.error('Failed to fetch session:', res.status);
      }
    } catch (err) {
      // Don't log abort errors (expected on unmount)
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      setError(t('customerDisplay.failedToConnect', 'Failed to connect to server'));
      console.error('Failed to fetch session:', err);
    } finally {
      setLoading(false);
    }
  }, [sessionId, retryCount, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for updates with smart backoff for 404s
  useEffect(() => {
    // Only start polling if we have a session and payment isn't complete
    if (!sessionId || sessionData.paymentStatus === 'completed') {
      return;
    }

    fetchSession();

    // Calculate interval with exponential backoff to avoid rate limiting
    const intervalMs = Math.min(
      POLLING_CONFIG.BASE_INTERVAL_MS + retryCount * POLLING_CONFIG.BACKOFF_INCREMENT_MS,
      POLLING_CONFIG.MAX_INTERVAL_MS
    );
    const interval = setInterval(fetchSession, intervalMs);
    return () => clearInterval(interval);
  }, [fetchSession, retryCount, sessionId, sessionData.paymentStatus]);

  // Auto-reset screens when payment completes
  useEffect(() => {
    if (sessionData.paymentStatus === 'completed') {
      // Show thank you screen for configured duration, then reset
      const timer = setTimeout(
        () => setShowPaymentScreen(false),
        POLLING_CONFIG.COMPLETION_AUTO_RESET_MS
      );
      return () => clearTimeout(timer);
    }
  }, [sessionData.paymentStatus]);

  // Auto-reset payment screen if idle for too long
  useEffect(() => {
    if (!showPaymentScreen) return;

    const idleTimer = setTimeout(() => {
      console.warn('Payment screen idle timeout, resetting...');
      setShowPaymentScreen(false);
    }, POLLING_CONFIG.PAYMENT_IDLE_TIMEOUT_MS);

    return () => clearTimeout(idleTimer);
  }, [showPaymentScreen]);

  if (!sessionId) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800" role="alert" aria-label="No session found error">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-4">{t('customerDisplay.noSessionFound', 'No Session Found')}</h1>
          <p className="text-gray-400">{t('customerDisplay.noSessionMessage', 'Please open this page with a valid session ID')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-red-900 to-red-800" role="alert" aria-live="assertive">
        <div className="text-center max-w-md">
          <svg className="mx-auto h-24 w-24 text-red-300 mb-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-label="Error icon" role="img">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4v2m0 4v2m0-12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h1 className="text-3xl font-bold text-white mb-4">{t('customerDisplay.connectionError', 'Connection Error')}</h1>
          <p className="text-red-200 text-lg mb-6">{error}</p>
          <p className="text-red-300 text-sm">Session ID: {sessionId.substring(0, 20)}...</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-6 py-3 bg-white text-red-700 font-bold rounded-lg hover:bg-red-50 transition-colors"
          >
            {t('customerDisplay.retry', 'Retry')}
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800" role="status" aria-label="Loading session">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" aria-hidden="true"></div>
          <p className="text-white">{t('customerDisplay.loadingSession', 'Loading session...')}</p>
        </div>
      </div>
    );
  }

  if (sessionData.cart.length === 0 && sessionData.paymentStatus === 'pending') {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800" role="status" aria-label="Waiting for items to be scanned">
        <div className="text-center">
          <svg className="mx-auto h-24 w-24 text-gray-600 mb-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true" role="img">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <h1 className="text-4xl font-bold text-white mb-4">{t('customerDisplay.waitingForItems', 'Waiting for Items...')}</h1>
          <p className="text-gray-400 text-xl">{t('customerDisplay.scanItemsToStart', 'Scan items to get started')}</p>
        </div>
      </div>
    );
  }

  // Show completed screen
  if (sessionData.paymentStatus === 'completed') {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-green-600 to-green-900" role="status" aria-label="Payment completed successfully">
        <div className="text-center">
          <svg className="mx-auto h-32 w-32 text-white mb-6 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1} aria-hidden="true" role="img">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h1 className="text-5xl font-bold text-white mb-4">{t('customerDisplay.thankYou', 'Thank You!')}</h1>
          <p className="text-green-100 text-2xl">{t('customerDisplay.paymentComplete', 'Payment Complete')}</p>
          <p className="text-green-200 text-xl mt-4">{t('common.total', 'Total')}: <Currency amount={sessionData.total} /></p>
        </div>
      </div>
    );
  }

  // Main display with cart items and tip screen
  return (
    <div className="w-screen h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex flex-col p-8 overflow-hidden">
      {/* Header */}
      <div className="text-center mb-8 flex-shrink-0">
        <h1 className="text-6xl font-bold text-white mb-2">{t('customerDisplay.yourOrder', 'Your Order')}</h1>
        <p className="text-gray-400 text-xl" role="status" aria-label={`Session ID: ${sessionId.substring(0, 8)}`}>
          {t('customerDisplay.session', 'Session')}: {sessionId.substring(0, 8)}...
        </p>
      </div>

      {/* Main content - Cart Items and Tip Screen */}
      <div className="flex-1 flex gap-8 min-h-0">
        {/* Cart Items (Left) */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="bg-gray-800 rounded-2xl p-8 border border-gray-700 flex-1 overflow-y-auto overscroll-contain">
            <h2 className="text-3xl font-bold text-white mb-6 flex-shrink-0">{t('customerDisplay.items', 'Items')}</h2>
            <div className="space-y-4 pr-2">
              {sessionData.cart.map((item) => (
                <div key={item.productId} className="bg-gray-700 rounded-xl p-6 flex justify-between items-center flex-shrink-0">
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-2xl font-semibold text-white truncate">{item.name}</p>
                    <p className="text-gray-400 text-lg">{t('customerDisplay.qty', 'Qty')}: {item.quantity}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-3xl font-bold text-blue-400">
                      <Currency amount={item.price * item.quantity} />
                    </p>
                    <p className="text-gray-400 text-sm">
                      <Currency amount={item.price} /> {t('pos.each', 'each')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Subtotal and Discount */}
          <div className="bg-gray-700 rounded-xl p-6 mt-4 border border-gray-600 flex-shrink-0">
            <div className="flex justify-between items-center mb-4">
              <p className="text-gray-300 text-xl">{t('pos.subtotal', 'Subtotal')}</p>
              <p className="text-2xl font-bold text-white">
                <Currency amount={sessionData.subtotal} />
              </p>
            </div>

            {sessionData.discount && (
              <div className="flex justify-between items-center mb-4 text-green-400">
                <p className="text-lg">{sessionData.discount.name || sessionData.discount.code}</p>
                <p className="text-2xl font-bold">
                  -<Currency amount={sessionData.discount.amount} />
                </p>
              </div>
            )}

            {sessionData.taxAmount !== undefined && sessionData.taxAmount > 0 && (
              <div className="flex justify-between items-center mb-4 text-amber-300">
                <p className="text-lg">
                  {sessionData.taxLabel || t('customerDisplay.tax', 'Tax')}
                  {sessionData.taxRate ? ` (${sessionData.taxRate}%)` : ''}
                </p>
                <p className="text-2xl font-bold">
                  +<Currency amount={sessionData.taxAmount} />
                </p>
              </div>
            )}

            <div className="border-t border-gray-600 pt-4">
              <div className="flex justify-between items-center">
                <p className="text-gray-300 text-2xl font-semibold">{t('common.total', 'Total')}</p>
                <p className="text-4xl font-bold text-blue-400">
                  <Currency amount={sessionData.total} />
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right side - Payment Screen */}
        <div className="w-96 flex flex-col gap-6 min-h-0">
          {/* Payment Screen */}
          {showPaymentScreen && (
            <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-8 border border-blue-500 flex flex-col justify-between flex-1 min-h-0 overflow-y-auto">
              <div className="flex-shrink-0">
                <h2 className="text-4xl font-bold text-white mb-2">{t('customerDisplay.readyToPay', 'Ready to Pay?')}</h2>
                <p className="text-blue-200 text-lg">{t('common.total', 'Total')}: <Currency amount={sessionData.total} className="text-4xl" /></p>
              </div>

              <div className="space-y-4 my-8 flex-1 flex flex-col justify-center">
                <button
                  onClick={() => {
                    fetch(`/api/pos/session/${sessionId}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        tenant,
                        action: 'update-payment-method',
                        data: { paymentMethod: 'cash' },
                      }),
                    });
                  }}
                  aria-label="Pay with cash"
                  className="w-full py-6 bg-white text-green-700 font-bold text-2xl rounded-xl hover:bg-green-50 transition-colors flex items-center justify-center gap-3"
                >
                  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true" role="img">
                    <path d="M4 4h16v2H4V4zm0 4h16v2H4V8zm0 4h16v2H4v-2zm0 4h16v2H4v-2z"/>
                  </svg>
                  {t('pos.cash', 'Cash')}
                </button>

                <button
                  onClick={() => {
                    fetch(`/api/pos/session/${sessionId}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        tenant,
                        action: 'update-payment-method',
                        data: { paymentMethod: 'card' },
                      }),
                    });
                  }}
                  aria-label="Pay with card"
                  className="w-full py-6 bg-white text-blue-700 font-bold text-2xl rounded-xl hover:bg-blue-50 transition-colors flex items-center justify-center gap-3"
                >
                  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true" role="img">
                    <path d="M3 4h18v2H3V4zm0 6h18v2H3v-2zm0 6h18v2H3v-2zm0 6h18v2H3v-2z"/>
                  </svg>
                  {t('pos.card', 'Card')}
                </button>

                <button
                  onClick={() => {
                    fetch(`/api/pos/session/${sessionId}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        tenant,
                        action: 'update-payment-method',
                        data: { paymentMethod: 'digital' },
                      }),
                    });
                  }}
                  aria-label="Pay with digital wallet or NFC"
                  className="w-full py-6 bg-white text-indigo-700 font-bold text-2xl rounded-xl hover:bg-indigo-50 transition-colors flex items-center justify-center gap-3"
                >
                  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true" role="img">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
                  </svg>
                  {t('customerDisplay.digitalNFC', 'Digital / NFC')}
                </button>
              </div>

              <p className="text-center text-blue-200 text-lg flex-shrink-0">{t('customerDisplay.staffWillComplete', 'Staff will complete payment')}</p>
            </div>
          )}

          {/* Processing Screen */}
          {sessionData.paymentStatus === 'processing' && (
            <div className="bg-gradient-to-br from-orange-600 to-orange-800 rounded-2xl p-8 border border-orange-500 flex flex-col justify-center items-center flex-1 min-h-0" role="status" aria-label="Processing payment">
              <div className="animate-spin h-24 w-24 border-4 border-white border-t-transparent rounded-full mb-6" aria-hidden="true"></div>
              <h2 className="text-3xl font-bold text-white">{t('customerDisplay.processingPayment', 'Processing Payment...')}</h2>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
