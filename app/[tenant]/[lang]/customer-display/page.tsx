'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Banknote, CreditCard, Smartphone } from 'lucide-react';
import { ReceiptRow } from '@/components/marketing/primitives';
import Currency from '@/components/Currency';
import CustomerDisplayScreen, { DISPLAY_SHELL, LedAmount } from '@/components/customer-display/CustomerDisplayScreen';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDictionaryClient } from '../dictionaries-client';
import {
  useCustomerDisplaySession,
  CUSTOMER_DISPLAY_POLLING,
  type SessionError,
} from '@/hooks/useCustomerDisplaySession';
import type { TranslationDict } from '@/types/dictionary';

const PAYMENT_METHODS = [
  { id: 'cash', Icon: Banknote },
  { id: 'card', Icon: CreditCard },
  { id: 'digital', Icon: Smartphone },
] as const;

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
  const { settings } = useTenantSettings();

  const [dict, setDict] = useState<TranslationDict | null>(null);
  const { sessionData, status, error: sessionError, refetch } = useCustomerDisplaySession(sessionId, tenant);
  const [showPaymentScreen, setShowPaymentScreen] = useState(false);
  // Shown straight away; the next poll confirms it from the session
  const [chosenMethod, setChosenMethod] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const itemCount = sessionData.cart.length;

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

  // Keep the newest scan in view, as a receipt printer feeds paper upward
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [itemCount]);

  if (!dict) {
    return <CustomerDisplayScreen variant="loading" title="Loading..." />;
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
        sessionLabel={displayDict.session || 'Session'}
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
        stamp={displayDict.paidStamp || 'Paid'}
        amount={sessionData.total}
      />
    );
  }

  const methodLabel = {
    cash: dict.pos?.cash || 'Cash',
    card: dict.pos?.card || 'Card',
    digital: displayDict.digitalNFC || 'Digital / NFC',
  };
  const selectedMethod = sessionData.paymentMethod ?? chosenMethod;
  const processing = sessionData.paymentStatus === 'processing';

  const chooseMethod = (method: string) => {
    setChosenMethod(method);
    fetch(`/api/pos/session/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant,
        action: 'update-payment-method',
        data: { paymentMethod: method },
      }),
    }).catch(() => setChosenMethod(null));
  };

  return (
    <div className={`${DISPLAY_SHELL} flex min-h-dvh flex-col lg:h-dvh`}>
      <div className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-6 p-4 sm:p-6 lg:min-h-0 lg:flex-row lg:p-8">
        {/* The order, printing onto a receipt */}
        <section className="flex min-w-0 flex-col lg:min-h-0 lg:flex-[7]">
          <div className="flex flex-1 flex-col bg-paper-white text-ink lg:min-h-0">
            <header className="border-b border-dashed border-ink/30 px-5 py-5 sm:px-8">
              {settings?.companyName && (
                <p className="font-receipt text-sm uppercase tracking-[0.14em] text-ink/60">{settings.companyName}</p>
              )}
              <h1 className="mt-1 text-5xl xl:text-7xl">{displayDict.yourOrder || 'Your Order'}</h1>
              <p className="mt-2 font-receipt text-xs uppercase text-ink/50" role="status">
                {displayDict.session || 'Session'}: {sessionId.substring(0, 8)}
              </p>
            </header>

            <ol
              ref={listRef}
              aria-label={displayDict.items || 'Items'}
              className="divide-y divide-dashed divide-ink/20 px-5 sm:px-8 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain"
            >
              {sessionData.cart.map((item, index) => (
                <li key={`${item.productId}-${index}`} className="flex items-baseline gap-4 py-4">
                  <span className="w-12 shrink-0 font-receipt text-xl text-ink/60 xl:w-16 xl:text-2xl">{item.quantity}×</span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 break-words text-2xl font-semibold xl:text-3xl">{item.name}</p>
                    <p className="font-receipt text-sm text-ink/60">
                      <Currency amount={item.price} /> {dict.pos?.each || 'each'}
                    </p>
                  </div>
                  <span className="shrink-0 whitespace-nowrap font-receipt text-2xl font-medium xl:text-3xl">
                    <Currency amount={item.price * item.quantity} />
                  </span>
                </li>
              ))}
            </ol>

            <div className="space-y-2 border-t-2 border-dashed border-ink/40 px-5 py-5 font-receipt text-lg sm:px-8 xl:text-xl">
              <ReceiptRow label={dict.pos?.subtotal || 'Subtotal'} value={<Currency amount={sessionData.subtotal} />} />
              {sessionData.discount && (
                <ReceiptRow
                  label={sessionData.discount.name || sessionData.discount.code}
                  value={<>-<Currency amount={sessionData.discount.amount} /></>}
                />
              )}
              {sessionData.taxAmount !== undefined && sessionData.taxAmount > 0 && (
                <ReceiptRow
                  label={`${sessionData.taxLabel || displayDict.tax || 'Tax'}${sessionData.taxRate ? ` (${sessionData.taxRate}%)` : ''}${
                    sessionData.taxIncluded ? ` ${dict.pos?.taxIncluded || 'included'}` : ''
                  }`}
                  value={sessionData.taxIncluded ? <Currency amount={sessionData.taxAmount} /> : <>+<Currency amount={sessionData.taxAmount} /></>}
                />
              )}
            </div>
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </section>

        <aside className="flex min-w-0 flex-col gap-6 lg:min-h-0 lg:flex-[5]">
          {/* The pole display */}
          <div className="border border-white/10 bg-black/40 px-6 py-6">
            <p className="font-receipt text-sm uppercase tracking-[0.14em] text-paper/60">{dict.common.total || 'Total'}</p>
            <LedAmount amount={sessionData.total} className="mt-3 text-6xl text-[#7df0d6] xl:text-8xl" />
          </div>

          {showPaymentScreen && !processing && (
            <div className="flex flex-col bg-brand p-6 text-ink lg:min-h-0 lg:flex-1 lg:overflow-y-auto xl:p-8">
              <h2 className="text-4xl xl:text-5xl">{displayDict.readyToPay || 'Ready to Pay?'}</h2>
              <div className="my-6 grid gap-3 lg:flex-1 lg:content-center">
                {PAYMENT_METHODS.map(({ id, Icon }) => {
                  const selected = selectedMethod === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => chooseMethod(id)}
                      aria-pressed={selected}
                      className={`flex min-h-[72px] items-center gap-4 px-6 text-left text-2xl font-semibold transition-colors touch-manipulation ${
                        selected ? 'bg-ink text-paper-white' : 'bg-paper-white text-ink hover:bg-paper'
                      }`}
                    >
                      <Icon className="h-8 w-8 shrink-0" strokeWidth={1.75} aria-hidden />
                      {methodLabel[id]}
                    </button>
                  );
                })}
              </div>
              <p className="font-receipt text-sm uppercase tracking-[0.08em] text-ink/80">
                {displayDict.staffWillComplete || 'Staff will complete payment'}
              </p>
            </div>
          )}

          {processing && (
            <div className="relative flex flex-col items-center justify-center overflow-hidden border border-white/10 bg-black/30 px-6 py-16 lg:flex-1" role="status">
              <div className="mk-sweep" aria-hidden />
              <h2 className="text-center text-4xl text-paper-white xl:text-5xl">
                {displayDict.processingPayment || 'Processing Payment...'}
              </h2>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
