'use client';

import Currency from '@/components/Currency';
import type { SplitPaymentEntry } from '@/hooks/usePayment';

export type SplitGuestPayment = SplitPaymentEntry & { collected: boolean };

export interface PosSplitCheckModalProps {
  dictValue: (path: string, fallback?: string) => string;
  primaryColor: string;
  total: number;
  splitStep: 'guests' | 'payments';
  setSplitStep: (step: 'guests' | 'payments') => void;
  splitGuests: number;
  setSplitGuests: (value: number | ((prev: number) => number)) => void;
  guestPayments: SplitGuestPayment[];
  setGuestPayments: (value: SplitGuestPayment[] | ((prev: SplitGuestPayment[]) => SplitGuestPayment[])) => void;
  enableOnAccountSales: boolean;
  processing: boolean;
  onClose: () => void;
  onCollectGuest: (guestIndex: number) => void;
  onCompleteSplitPayment: () => void | Promise<void>;
}

export default function PosSplitCheckModal({
  dictValue,
  primaryColor,
  total,
  splitStep,
  setSplitStep,
  splitGuests,
  setSplitGuests,
  guestPayments,
  setGuestPayments,
  enableOnAccountSales,
  processing,
  onClose,
  onCollectGuest,
  onCompleteSplitPayment,
}: PosSplitCheckModalProps) {
  const handleClose = () => {
    onClose();
    setSplitStep('guests');
    setGuestPayments([]);
  };

  return (
    <div
      className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className="bg-white border border-gray-300 w-full max-w-sm shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: primaryColor }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            Split Check
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {splitStep === 'guests' ? (
          <div className="px-6 py-5">
            <p className="text-sm text-gray-600 mb-4">Split the total equally among guests.</p>
            <div className="flex items-center gap-4 mb-5">
              <label className="text-sm font-semibold text-gray-700 w-28">Number of guests</label>
              <div className="flex items-center border-2 border-gray-300 bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => setSplitGuests((g) => Math.max(2, g - 1))}
                  className="px-4 py-3 min-w-[44px] min-h-[44px] hover:bg-gray-100 font-bold text-xl transition-colors"
                >
                  −
                </button>
                <span className="px-5 py-3 font-bold text-lg min-w-[3rem] text-center">{splitGuests}</span>
                <button
                  type="button"
                  onClick={() => setSplitGuests((g) => Math.min(20, g + 1))}
                  className="px-4 py-3 min-w-[44px] min-h-[44px] hover:bg-gray-100 font-bold text-xl transition-colors"
                >
                  +
                </button>
              </div>
            </div>
            <div className="bg-gray-50 border border-gray-200 px-4 py-3 mb-5 space-y-1.5">
              <div className="flex justify-between text-sm text-gray-600">
                <span>{dictValue('common.total', 'Total')}</span>
                <span className="font-semibold"><Currency amount={total} /></span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>{dictValue('pos.guests', 'Guests')}</span>
                <span className="font-semibold">{splitGuests}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-gray-900 border-t border-gray-200 pt-1.5">
                <span>{dictValue('pos.perGuest', 'Per guest')}</span>
                <span style={{ color: primaryColor }}>
                  <Currency amount={total / splitGuests} />
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const perGuest = parseFloat((total / splitGuests).toFixed(2));
                setGuestPayments(
                  Array.from({ length: splitGuests }, (_, i) => ({
                    guestIndex: i + 1,
                    method: 'cash',
                    amount: perGuest,
                    reference: undefined,
                    collected: false,
                  }))
                );
                setSplitStep('payments');
              }}
              className="w-full py-4 min-h-[52px] text-white font-bold text-base transition-colors border"
              style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
            >
              {dictValue('pos.continueToPayment', 'Continue to Payment')} →
            </button>
          </div>
        ) : (
          <div className="px-6 py-5">
            <p className="text-sm text-gray-600 mb-4">{dictValue('pos.collectPaymentInstruction', 'Collect payment from each guest.')}</p>
            <div className="space-y-2 mb-5 max-h-72 overflow-y-auto">
              {guestPayments.map((entry, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-2 p-3 border ${entry.collected ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'}`}
                >
                  <span className="text-xs font-bold text-gray-500 w-14 shrink-0">{dictValue('pos.guestLabel', 'Guest')} {idx + 1}</span>
                  <span className="text-sm font-semibold text-gray-800 w-20 shrink-0">
                    <Currency amount={entry.amount} />
                  </span>
                  {entry.collected ? (
                    <span className="flex-1 text-xs text-green-600 font-semibold text-center">✓ {dictValue('pos.collectedWith', 'Collected')} ({entry.method})</span>
                  ) : (
                    <>
                      <select
                        value={entry.method}
                        onChange={(e) =>
                          setGuestPayments((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, method: e.target.value } : p))
                          )
                        }
                        className="flex-1 text-xs border border-gray-300 px-2 py-1.5 bg-white"
                      >
                        <option value="cash">{dictValue('pos.cash', 'Cash')}</option>
                        <option value="card">{dictValue('pos.card', 'Card')}</option>
                        <option value="wallet">{dictValue('pos.wallet', 'Wallet')}</option>
                        <option value="qr_code">{dictValue('pos.qrCodeOption', 'QR Code')}</option>
                        {enableOnAccountSales && (
                          <option value="on_account">{dictValue('pos.onAccount', 'On account')}</option>
                        )}
                      </select>
                      <button
                        type="button"
                        onClick={() => onCollectGuest(idx)}
                        className="shrink-0 px-3 py-1.5 text-xs font-bold text-white"
                        style={{ backgroundColor: primaryColor }}
                      >
                        {dictValue('pos.collect', 'Collect')}
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              disabled={processing || !guestPayments.every((g) => g.collected)}
              onClick={onCompleteSplitPayment}
              className="w-full py-4 min-h-[52px] text-white font-bold text-base transition-colors border disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
            >
              {processing
                ? dictValue('pos.processing', 'Processing...')
                : `${dictValue('pos.completeOrder', 'Complete Order')} (${guestPayments.filter((g) => g.collected).length}/${splitGuests} ${dictValue('pos.collectedWith', 'collected')})`}
            </button>
            <button
              type="button"
              onClick={() => setSplitStep('guests')}
              className="w-full mt-2 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              ← {dictValue('pos.backToGuestCount', 'Back to guest count')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
