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
      className="fixed inset-0 bg-gray-900/30 backdrop-blur-md z-50"
      onClick={handleClose}
    >
      <div
        className="absolute inset-y-0 right-0 w-full max-w-md bg-white border-l border-gray-300 flex flex-col animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 sm:p-6 border-b border-gray-200">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{dict.pos.payment}</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          <div className="mb-5">
            <div className="text-lg font-semibold text-gray-900 mb-5">
              {dict.common.total}: <Currency amount={total} />
            </div>
            <div className="space-y-5">
              <label className="block text-sm font-bold text-gray-900">
                {dict.pos.paymentMethod}
              </label>

              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: 'cash', label: dict.pos.cash || 'Cash', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
                  { id: 'card', label: dict.pos.card || 'Card', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
                  { id: 'tap_to_pay', label: 'Tap to Pay', icon: 'M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0' },
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
                      className={`p-3 border-2 transition-all duration-150 flex flex-col items-center justify-center gap-1.5 ${isSelected
                        ? 'border-2'
                        : 'bg-gray-50 border-gray-200 hover:border-gray-300 hover:bg-gray-100'
                        } ${onAcctDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                      style={isSelected ? { backgroundColor: `${primaryColor}12`, borderColor: primaryColor } : undefined}
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                        style={{ color: isSelected ? primaryColor : '#6b7280' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                      </svg>
                      <span className="text-xs font-semibold leading-tight text-center"
                        style={{ color: isSelected ? primaryColor : '#374151' }}>
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {paymentMethod === 'cash' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
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
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 transition-all"
                    placeholder="0.00"
                    autoFocus
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = primaryColor;
                      e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}30`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                  {cashReceived && parseFloat(cashReceived) >= total && (
                    <div className="mt-2 px-3 py-2 bg-green-50 border border-green-200 text-sm text-green-700 font-medium flex justify-between">
                      <span>{dict.pos.change}</span>
                      <Currency amount={Math.round((parseFloat(cashReceived) - total) * 100) / 100} />
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
                      className={`flex-1 py-2 text-xs font-semibold border-2 transition-all ${paymentProvider === brand
                        ? 'text-white border-transparent'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      style={paymentProvider === brand ? { backgroundColor: primaryColor, borderColor: primaryColor } : undefined}
                    >
                      {brand}
                    </button>
                  ))}
                </div>
              )}

              {paymentMethod === 'tap_to_pay' && (
                <div className="flex items-center gap-3 px-4 py-3 bg-brand-soft border border-teal-200 text-sm text-brand-navy">
                  <svg className="w-5 h-5 flex-shrink-0 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                  </svg>
                  <span>{dictValue('pos.nfcInstruction', 'Hold phone or wearable near the reader. Supports Apple Pay, Google Pay & NFC cards.')}</span>
                </div>
              )}

              {paymentMethod === 'wallet' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-2">{dictValue('pos.selectWallet', 'Select wallet')}</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['GCash', 'Maya', 'PayPal', 'ShopeePay', 'Grab', 'Other'] as const).map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => setPaymentProvider(paymentProvider === w ? '' : w)}
                          className={`py-2 px-1 text-xs font-semibold border-2 transition-all ${paymentProvider === w
                            ? 'text-white border-transparent'
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                            }`}
                          style={paymentProvider === w ? { backgroundColor: primaryColor, borderColor: primaryColor } : undefined}
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">{dictValue('pos.referenceNoOptional', 'Reference no.')} <span className="text-gray-400">({dictValue('pos.referenceNoHint', 'optional')})</span></label>
                    <input
                      type="text"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder={dictValue('pos.gcashPlaceholder', 'e.g. GCash transaction ID')}
                      className="w-full px-3 py-2.5 text-sm border-2 border-gray-300 transition-all"
                      onFocus={(e) => { e.currentTarget.style.borderColor = primaryColor; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = '#d1d5db'; }}
                    />
                  </div>
                </div>
              )}

              {paymentMethod === 'qr_code' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 text-sm text-gray-700">
                    <svg className="w-5 h-5 flex-shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 4h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                    <span>{dictValue('pos.qrPaymentInstruction', 'Show the QR code to the customer to scan (QR Ph / InstaPay).')}</span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">{dictValue('pos.referenceNoOptional', 'Reference no.')} <span className="text-gray-400">({dictValue('pos.referenceNoHint', 'optional')})</span></label>
                    <input
                      type="text"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder={dictValue('pos.instaPayPlaceholder', 'e.g. InstaPay reference')}
                      className="w-full px-3 py-2.5 text-sm border-2 border-gray-300 transition-all"
                      onFocus={(e) => { e.currentTarget.style.borderColor = primaryColor; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = '#d1d5db'; }}
                    />
                  </div>
                </div>
              )}

              {paymentMethod === 'bnpl' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-2">BNPL provider</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['BillEase', 'Akulaku', 'Atome', 'Kredivo', 'Tala', 'Other'] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPaymentProvider(paymentProvider === p ? '' : p)}
                          className={`py-2 px-1 text-xs font-semibold border-2 transition-all ${paymentProvider === p
                            ? 'text-white border-transparent'
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                            }`}
                          style={paymentProvider === p ? { backgroundColor: primaryColor, borderColor: primaryColor } : undefined}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-2">Installments</label>
                    <div className="flex gap-2">
                      {[1, 3, 6, 12].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setBnplInstallments(n)}
                          className={`flex-1 py-2 text-xs font-semibold border-2 transition-all ${bnplInstallments === n
                            ? 'text-white border-transparent'
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                            }`}
                          style={bnplInstallments === n ? { backgroundColor: primaryColor, borderColor: primaryColor } : undefined}
                        >
                          {n === 1 ? 'Full' : `${n}×`}
                        </button>
                      ))}
                    </div>
                    {bnplInstallments > 1 && (
                      <p className="text-xs text-gray-500 mt-1.5">
                        ≈ <Currency amount={Math.ceil((total / bnplInstallments) * 100) / 100} /> / month
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Reference no. <span className="text-gray-400">(optional)</span></label>
                    <input
                      type="text"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="Approval / order ID"
                      className="w-full px-3 py-2.5 text-sm border-2 border-gray-300 transition-all"
                      onFocus={(e) => { e.currentTarget.style.borderColor = primaryColor; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = '#d1d5db'; }}
                    />
                  </div>
                </div>
              )}

              {paymentMethod === 'on_account' && (
                <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {dictValue('pos.onAccountHint', 'Adds this sale to the selected customer balance. Collect payment later from Customers.')}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={handleClose}
              className="w-full sm:w-auto px-4 py-2.5 border-2 border-gray-300 text-gray-700 hover:bg-gray-100 font-medium transition-colors bg-white"
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
              className="w-full sm:w-auto px-4 py-2.5 text-white font-medium transition-colors border disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: primaryColor,
                borderColor: primaryColor,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${primaryColor}dd`; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = primaryColor; }}
            >
              {processing ? dict.pos.processing : dict.pos.completePayment}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
