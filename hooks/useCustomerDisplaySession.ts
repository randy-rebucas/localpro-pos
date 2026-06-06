'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface SessionData {
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

export type SessionStatus = 'loading' | 'ready' | 'error';

export type SessionErrorCode =
  | 'invalidSessionData'
  | 'sessionNotFound'
  | 'failedToConnect'
  | 'loadFailed';

export interface SessionError {
  code: SessionErrorCode;
  detail?: string;
}

const POLLING_CONFIG = {
  BASE_INTERVAL_MS: 1000,
  BACKOFF_INCREMENT_MS: 100,
  MAX_INTERVAL_MS: 5000,
  RETRY_LIMIT: 10,
} as const;

const EMPTY_SESSION: SessionData = {
  cart: [],
  subtotal: 0,
  discount: null,
  tip: 0,
  total: 0,
  paymentMethod: null,
  paymentStatus: 'pending',
};

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

export function useCustomerDisplaySession(sessionId: string | null) {
  const [sessionData, setSessionData] = useState<SessionData>(EMPTY_SESSION);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [error, setError] = useState<SessionError | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortControllerRef.current = new AbortController();
    setRetryCount(0);
    setStatus('loading');
    setError(null);
    setSessionData(EMPTY_SESSION);

    return () => abortControllerRef.current?.abort();
  }, [sessionId]);

  const refetch = useCallback(async () => {
    if (!sessionId || !abortControllerRef.current) return;

    setError(null);
    setStatus('loading');
    setRetryCount(0);

    try {
      const res = await fetch(`/api/pos/session/${sessionId}`, {
        signal: abortControllerRef.current.signal,
      });

      if (res.ok) {
        const data = await res.json();
        if (!isValidSessionData(data.data)) {
          setError({ code: 'invalidSessionData' });
          setStatus('error');
          return;
        }
        setSessionData(data.data);
        setError(null);
        setRetryCount(0);
        setStatus('ready');
        return;
      }

      if (res.status === 404) {
        setRetryCount((prev) => {
          const next = prev + 1;
          if (next > POLLING_CONFIG.RETRY_LIMIT) {
            setError({ code: 'sessionNotFound' });
            setStatus('error');
          } else {
            setStatus('loading');
          }
          return next;
        });
        return;
      }

      setError({ code: 'loadFailed', detail: String(res.status) });
      setStatus('error');
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError({ code: 'failedToConnect' });
      setStatus('error');
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || sessionData.paymentStatus === 'completed') return;

    refetch();

    const intervalMs = Math.min(
      POLLING_CONFIG.BASE_INTERVAL_MS + retryCount * POLLING_CONFIG.BACKOFF_INCREMENT_MS,
      POLLING_CONFIG.MAX_INTERVAL_MS
    );
    const interval = setInterval(refetch, intervalMs);
    return () => clearInterval(interval);
  }, [refetch, sessionId, sessionData.paymentStatus, retryCount]);

  return { sessionData, status, error, refetch };
}

export const CUSTOMER_DISPLAY_POLLING = {
  COMPLETION_AUTO_RESET_MS: 5000,
  PAYMENT_IDLE_TIMEOUT_MS: 120000,
} as const;
