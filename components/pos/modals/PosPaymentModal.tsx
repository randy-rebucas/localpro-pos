'use client';

import Currency from '@/components/Currency';
import type { TranslationDict } from '@/types/dictionary';
import type { PaymentMethodType } from '@/hooks/usePayment';
import type { CustomerSummary } from '@/types/customer';

export interface PosPaymentModalProps {
  dict: TranslationDict;
  dictValue: (path: string, fallback?: string) => string;
  primaryColor: string;
  total: number;
  paymentMethod: PaymentMethodType;
  setPaymentMethod: (method: PaymentMethodType) => void;
  cashReceived: string;
  setCashReceived: (value: string) => void;
  paymentProvider: string;
  setPaymentProvider: (value: string) => void;
  paymentReference: string;
  setPaymentReference: (value: string) => void;
  bnplInstallments: number;
  setBnplInstallments: (value: number) => void;
  enableOnAccountSales: boolean;
  selectedCustomer: CustomerSummary | null;
  processing: boolean;
  onClose: () => void;
  onCompletePayment: () => void | Promise<void>;
}

export default function PosPaymentModal({
  dict,
  dictValue,
  primaryColor,
  total,
  paymentMethod,
  setPaymentMethod,
  cashReceived,
  setCashReceived,
  paymentProvider,
  setPaymentProvider,
  paymentReference,
  setPaymentReference,
  bnplInstallments,
  setBnplInstallments,
  enableOnAccountSales,
  selectedCustomer,
  processing,
  onClose,
  onCompletePayment,
}: PosPaymentModalProps) {
  const resetPaymentFields = () => {
    setCashReceived('');
    setPaymentProvider('');
    setPaymentReference('');
  };

  const handleClose = () => {
    onClose();
    resetPaymentFields();
  };

  return (
    <div
      className="fixed inset-0 bg-ink/60 z-50"
      onClick={handleClose}
    >
      <div
        className="absolute inset-y-0 right-0 w-full max-w-md bg-paper-white text-ink flex flex-col animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 bg-brand-navy-deep p-5 sm:p-6 text-paper-white">
          <div className="flex items-center justify-between">
            <h2 className="text-4xl">{dict.pos.payment}</h2>
            <button
              onClick={handleClose}
              className="flex items-center justify-center text-white/60 hover:text-paper-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-3 border border-white/10 bg-black/30 px-3 py-2 font-receipt">
            <span className="text-xs uppercase tracking-[0.14em] text-[#8fe3d0]">{dict.common.total}</span>
            <span className="mk-led-glow text-right text-3xl font-semibold tabular-nums text-[#7df0d6]">
              <Currency amount={total} />
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          <div className="mb-5">
            <div className="space-y-5">
              <label className="block font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/70">
                {dict.pos.paymentMethod}
              </label>

              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: 'cash', label: dict.pos.cash || 'Cash', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
                  { id: 'card', label: dict.pos.card || 'Card', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
                  { id: 'tap_to_pay', label: dictValue('pos.tapToPay', 'Tap to Pay'), icon: 'M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0' },
                  { id: 'wallet', label: dict.pos.wallet || 'Wallet', icon: 'M3 10h18M3 6h18M3 14h18M3 18h18' },
                  { id: 'qr_code', label: dict.pos.qrCodeOption || 'QR Code', icon: 'M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 4h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z' },
                  { id: 'bnpl', label: dictValue('pos.bnpl', 'Pay Later'), icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
                  ...(enableOnAccountSales
                    ? [{ id: 'on_account' as const, label: dictValue('pos.onAccount', 'On account'), icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' }]
                    : []),
                ] as const).map(({ id, label, icon }) => {
                  const isSelected = paymentMethod === id;
                  const onAcctDisabled = id === 'on_account' && !selectedCustomer;
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={onAcctDisabled}
                      onClick={() => {
                        if (onAcctDisabled) return;
                        setPaymentMethod(id);
                        resetPaymentFields();
                      }}
                      className={`p-3 border transition-colors flex flex-col items-center justify-center gap-1.5 ${isSelected
                        ? 'bg-ink border-ink text-paper-white'
                        : 'bg-paper-white border-ink/25 text-ink hover:border-ink'
                        } ${onAcctDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                      </svg>
                      <span className="font-receipt text-xs font-medium leading-tight text-center">
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {paymentMethod === 'cash' && (
                <div>
                  <label className="block font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/70 mb-2">
                    {dict.pos.cashReceived}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={cashReceived}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || parseFloat(val) >= 0) setCashReceived(val);
                    }}
                    className="w-full px-4 py-3 font-receipt text-base bg-paper-white border border-ink/25 transition-all"
                    placeholder="0.00"
                    autoFocus
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = primaryColor;
                      e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}30`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgb(16 32 43 / 0.25)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                  {cashReceived && parseFloat(cashReceived) >= total && (
                    <div className="mt-2 flex items-baseline justify-between gap-3 bg-ink px-3 py-2 font-receipt">
                      <span className="text-xs uppercase tracking-[0.14em] text-[#8fe3d0]">{dict.pos.change}</span>
                      <span className="mk-led-glow text-2xl font-semibold tabular-nums text-[#7df0d6]">
                        <Currency amount={Math.round((parseFloat(cashReceived) - total) * 100) / 100} />
                      </span>
                    </div>
                  )}
                </div>
              )}

              {paymentMethod === 'card' && (
                <div className="flex gap-2">
                  {(['Visa', 'Mastercard', 'Amex', 'Other'] as const).map((brand) => (
                    <button
                      key={brand}
                      type="button"
                      onClick={() => setPaymentProvider(paymentProvider === brand ? '' : brand)}
                      className={`flex-1 py-2 font-receipt text-xs font-medium border transition-colors ${paymentProvider === brand
                        ? 'bg-ink border-ink text-paper-white'
                        : 'bg-paper-white border-ink/25 text-ink hover:border-ink'
                        }`}
                    >
                      {brand === 'Other' ? dictValue('pos.otherProvider', 'Other') : brand}
                    </button>
                  ))}
                </div>
              )}

              {paymentMethod === 'tap_to_pay' && (
                <div className="flex items-center gap-3 px-4 py-3 bg-brand-soft border border-dashed border-brand text-sm text-ink">
                  <svg className="w-5 h-5 flex-shrink-0 text-brand-hover" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                  </svg>
                  <span>{dictValue('pos.nfcInstruction', 'Hold phone or wearable near the reader. Supports Apple Pay, Google Pay & NFC cards.')}</span>
                </div>
              )}

              {paymentMethod === 'wallet' && (
                <div className="space-y-3">
                  <div>
                    <label className="block font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/70 mb-2">{dictValue('pos.selectWallet', 'Select wallet')}</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['GCash', 'Maya', 'PayPal', 'ShopeePay', 'Grab', 'Other'] as const).map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => setPaymentProvider(paymentProvider === w ? '' : w)}
                          className={`py-2 px-1 font-receipt text-xs font-medium border transition-colors ${paymentProvider === w
                            ? 'bg-ink border-ink text-paper-white'
                            : 'bg-paper-white border-ink/25 text-ink hover:border-ink'
                            }`}
                        >
                          {w === 'Other' ? dictValue('pos.otherProvider', 'Other') : w}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/70 mb-1.5">{dictValue('pos.referenceNoOptional', 'Reference no.')} <span className="text-ink/50">({dictValue('pos.referenceNoHint', 'optional')})</span></label>
                    <input
                      type="text"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder={dictValue('pos.gcashPlaceholder', 'e.g. GCash transaction ID')}
                      className="w-full px-3 py-2.5 font-receipt text-sm bg-paper-white border border-ink/25 transition-all"
                      onFocus={(e) => { e.currentTarget.style.borderColor = primaryColor; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = 'rgb(16 32 43 / 0.25)'; }}
                    />
                  </div>
                </div>
              )}

              {paymentMethod === 'qr_code' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 px-4 py-3 bg-brand-soft border border-dashed border-brand text-sm text-ink">
                    <svg className="w-5 h-5 flex-shrink-0 text-brand-hover" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 4h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                    <span>{dictValue('pos.qrPaymentInstruction', 'Show the QR code to the customer to scan (QR Ph / InstaPay).')}</span>
                  </div>
                  <div>
                    <label className="block font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/70 mb-1.5">{dictValue('pos.referenceNoOptional', 'Reference no.')} <span className="text-ink/50">({dictValue('pos.referenceNoHint', 'optional')})</span></label>
                    <input
                      type="text"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder={dictValue('pos.instaPayPlaceholder', 'e.g. InstaPay reference')}
                      className="w-full px-3 py-2.5 font-receipt text-sm bg-paper-white border border-ink/25 transition-all"
                      onFocus={(e) => { e.currentTarget.style.borderColor = primaryColor; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = 'rgb(16 32 43 / 0.25)'; }}
                    />
                  </div>
                </div>
              )}

              {paymentMethod === 'bnpl' && (
                <div className="space-y-3">
                  <div>
                    <label className="block font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/70 mb-2">{dictValue('pos.bnplProvider', 'BNPL provider')}</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['BillEase', 'Akulaku', 'Atome', 'Kredivo', 'Tala', 'Other'] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPaymentProvider(paymentProvider === p ? '' : p)}
                          className={`py-2 px-1 font-receipt text-xs font-medium border transition-colors ${paymentProvider === p
                            ? 'bg-ink border-ink text-paper-white'
                            : 'bg-paper-white border-ink/25 text-ink hover:border-ink'
                            }`}
                        >
                          {p === 'Other' ? dictValue('pos.otherProvider', 'Other') : p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/70 mb-2">{dictValue('pos.installments', 'Installments')}</label>
                    <div className="flex gap-2">
                      {[1, 3, 6, 12].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setBnplInstallments(n)}
                          className={`flex-1 py-2 font-receipt text-xs font-medium border transition-colors ${bnplInstallments === n
                            ? 'bg-ink border-ink text-paper-white'
                            : 'bg-paper-white border-ink/25 text-ink hover:border-ink'
                            }`}
                        >
                          {n === 1 ? dictValue('pos.installmentsFull', 'Full') : `${n}×`}
                        </button>
                      ))}
                    </div>
                    {bnplInstallments > 1 && (
                      <p className="font-receipt text-xs text-ink/70 mt-1.5">
                        ≈ <Currency amount={Math.ceil((total / bnplInstallments) * 100) / 100} /> / {dictValue('pos.perMonth', 'month')}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/70 mb-1.5">{dictValue('pos.referenceNoOptional', 'Reference no.')} <span className="text-ink/50">({dictValue('pos.referenceNoHint', 'optional')})</span></label>
                    <input
                      type="text"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder={dictValue('pos.bnplRefPlaceholder', 'Approval / order ID')}
                      className="w-full px-3 py-2.5 font-receipt text-sm bg-paper-white border border-ink/25 transition-all"
                      onFocus={(e) => { e.currentTarget.style.borderColor = primaryColor; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = 'rgb(16 32 43 / 0.25)'; }}
                    />
                  </div>
                </div>
              )}

              {paymentMethod === 'on_account' && (
                <div className="mt-3 border border-dashed border-ink/30 bg-paper px-3 py-2 text-xs text-ink">
                  {dictValue('pos.onAccountHint', 'Adds this sale to the selected customer balance. Collect payment later from Customers.')}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={handleClose}
              className="w-full sm:w-auto px-4 py-2.5 border border-ink/25 bg-paper-white text-ink hover:border-ink font-receipt text-sm font-medium uppercase transition-colors"
            >
              {dict.common.cancel}
            </button>
            <button
              type="button"
              onClick={onCompletePayment}
              disabled={
                processing ||
                (paymentMethod === 'cash' && (!cashReceived || parseFloat(cashReceived) < total)) ||
                ((paymentMethod === 'wallet' || paymentMethod === 'bnpl') && !paymentProvider) ||
                (paymentMethod === 'on_account' && !selectedCustomer)
              }
              className="w-full sm:flex-1 px-4 py-3 bg-brand font-display text-2xl font-extrabold uppercase leading-none text-ink hover:bg-brand-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? dict.pos.processing : dict.pos.completePayment}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
