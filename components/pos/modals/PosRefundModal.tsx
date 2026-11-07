'use client';

import Currency from '@/components/Currency';
import { formatDateTime } from '@/lib/formatting';
import { getDefaultTenantSettings } from '@/lib/currency';
import { saleLineKey } from '@/lib/refund-plan';
import type { TranslationDict } from '@/types/dictionary';
import type { ITenantSettings } from '@/types/tenant';

export interface RefundTransactionItem {
  _id?: string;
  product?: unknown;
  name: string;
  price: number;
  quantity: number;
  refundedQuantity?: number;
}

export interface RefundTransaction {
  _id?: string;
  receiptNumber?: string;
  createdAt?: string;
  total?: number;
  items: RefundTransactionItem[];
}

export interface RefundItemSelection {
  productId: string;
  refundQty: number;
}

export interface PosRefundModalProps {
  dict: TranslationDict;
  primaryColor: string;
  settings: ITenantSettings | null;
  refundTransaction: RefundTransaction | null;
  refundTransactionId: string;
  setRefundTransactionId: (value: string) => void;
  refundItems: RefundItemSelection[];
  refundReason: string;
  setRefundReason: (value: string) => void;
  refundNotes: string;
  setRefundNotes: (value: string) => void;
  refunding: boolean;
  maxRefundNotesLength: number;
  onClose: () => void;
  onCloseFull: () => void;
  onLookupTransaction: () => void;
  onProcessRefund: () => void | Promise<void>;
  addRefundItem: (productId: string, maxQty: number) => void;
  removeRefundItem: (productId: string) => void;
  updateRefundQty: (productId: string, qty: number, maxQty: number) => void;
  calculateRefundAmount: (transaction: RefundTransaction) => number;
  currentRefundTransaction: RefundTransaction | null;
}

export default function PosRefundModal({
  dict,
  primaryColor,
  settings,
  refundTransaction,
  refundTransactionId,
  setRefundTransactionId,
  refundItems,
  refundReason,
  setRefundReason,
  refundNotes,
  setRefundNotes,
  refunding,
  maxRefundNotesLength,
  onClose,
  onCloseFull,
  onLookupTransaction,
  onProcessRefund,
  addRefundItem,
  removeRefundItem,
  updateRefundQty,
  calculateRefundAmount,
  currentRefundTransaction,
}: PosRefundModalProps) {
  return (
    <div
      className="fixed inset-0 bg-ink/60 z-50"
      onClick={onClose}
    >
      <div
        className="absolute inset-y-0 right-0 w-full max-w-2xl bg-paper-white text-ink flex flex-col animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 sm:p-6 border-b border-dashed border-ink/30">
          <h2 className="text-4xl text-ink">{dict.pos.refundTransaction}</h2>
          <button
            onClick={onCloseFull}
            className="text-ink/50 hover:text-ink transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {!refundTransaction ? (
            <div>
              <div className="mb-5">
                <label className="block font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/70 mb-2">
                  {dict.pos.transactionId} / {dict.pos.receiptNumber}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={refundTransactionId}
                    onChange={(e) => setRefundTransactionId(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && onLookupTransaction()}
                    className="flex-1 px-4 py-3 font-receipt text-base bg-paper-white border border-ink/25 transition-all"
                    placeholder={dict.pos.transactionId}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = primaryColor;
                      e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}30`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgb(16 32 43 / 0.25)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                  <button
                    type="button"
                    onClick={onLookupTransaction}
                    disabled={!refundTransactionId.trim()}
                    className="px-4 py-3 bg-ink text-paper-white hover:bg-brand-navy font-receipt font-medium uppercase transition-colors text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {dict.pos.lookupTransaction}
                  </button>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 border border-ink/25 bg-paper-white text-ink hover:border-ink font-receipt text-sm font-medium uppercase transition-colors"
                >
                  {dict.common.cancel}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-5 border-b border-dashed border-ink/30 pb-3 font-receipt">
                <div className="text-sm text-ink/70 mb-1">{dict.pos.receiptNumber}</div>
                <div className="font-semibold text-lg">{refundTransaction.receiptNumber || refundTransaction._id}</div>
                <div className="text-sm text-ink/70 mt-2">
                  {formatDateTime(new Date(refundTransaction.createdAt || new Date()), settings || getDefaultTenantSettings())}
                </div>
                <div className="text-sm text-ink/70">
                  {dict.common.total}: <Currency amount={refundTransaction.total || 0} />
                </div>
              </div>

              <div className="mb-5">
                <label className="block font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/70 mb-2">
                  {dict.pos.selectItemsToRefund}
                </label>
                <div className="max-h-64 overflow-y-auto border-y border-dashed border-ink/30">
                  {refundTransaction.items.map((item) => {
                    const productId = saleLineKey(item);
                    if (!productId) return null;
                    const maxQty = item.quantity - (item.refundedQuantity ?? 0);
                    const refundItem = refundItems.find((ri) => ri.productId === productId);
                    const currentQty: number = refundItem?.refundQty || 0;

                    return (
                      <div key={productId} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-dashed border-ink/25 last:border-b-0">
                        <div className="flex-1 min-w-[10rem]">
                          <div className="font-medium text-ink">{item.name}</div>
                          <div className="font-receipt text-xs text-ink/60">
                            {dict.pos.each}: <Currency amount={item.price} /> × {maxQty} {dict.common.items}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (currentQty > 0) {
                                updateRefundQty(productId, currentQty - 1, maxQty);
                              }
                            }}
                            className="px-3 py-2 border border-ink/25 hover:bg-paper"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min="0"
                            max={maxQty}
                            value={currentQty}
                            aria-label={`${dict.pos?.refundQuantityFor || 'Refund quantity for'} ${item.name}`}
                            onChange={(e) => {
                              const val = Math.max(0, Math.min(maxQty, parseInt(e.target.value) || 0));
                              if (val > 0) {
                                if (refundItem) {
                                  updateRefundQty(productId, val, maxQty);
                                } else {
                                  addRefundItem(productId, maxQty);
                                  setTimeout(() => updateRefundQty(productId, val, maxQty), 0);
                                }
                              } else if (refundItem) {
                                removeRefundItem(productId);
                              }
                            }}
                            className="w-16 px-2 py-2 text-center font-receipt bg-paper-white border border-ink/25"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (currentQty < maxQty) {
                                if (refundItem) {
                                  updateRefundQty(productId, currentQty + 1, maxQty);
                                } else {
                                  addRefundItem(productId, maxQty);
                                }
                              }
                            }}
                            className="px-3 py-2 border border-ink/25 hover:bg-paper"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (refundItem) {
                                updateRefundQty(productId, maxQty, maxQty);
                              } else {
                                addRefundItem(productId, maxQty);
                              }
                            }}
                            className="ml-1 px-2 py-1 font-receipt text-xs font-medium border border-ink/25 bg-paper-white text-ink hover:border-ink transition-colors"
                          >
                            {dict.pos.fullRefund}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mb-5">
                <label className="block font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/70 mb-2">
                  {dict.pos.refundReason}
                </label>
                <input
                  type="text"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="w-full px-4 py-3 font-receipt text-base bg-paper-white border border-ink/25 transition-all"
                  placeholder={dict?.pos?.refundReasonPlaceholder || 'Reason for refund'}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = primaryColor;
                    e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}30`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgb(16 32 43 / 0.25)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>

              <div className="mb-5">
                <label className="block font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/70 mb-2">
                  {dict.pos.refundNotes}
                </label>
                <textarea
                  value={refundNotes}
                  onChange={(e) => setRefundNotes(e.target.value.slice(0, maxRefundNotesLength))}
                  maxLength={maxRefundNotesLength}
                  rows={3}
                  className="w-full px-4 py-3 font-receipt text-base bg-paper-white border border-ink/25 transition-all"
                  placeholder={dict?.pos?.refundNotesPlaceholder || 'Additional notes'}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = primaryColor;
                    e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}30`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgb(16 32 43 / 0.25)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>

              {refundItems.length > 0 && currentRefundTransaction && (
                <div className="mb-5 p-4 border-2 border-stamp">
                  <div className="flex justify-between items-center">
                    <span className="font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink">
                      {dict.pos?.refundAmount || 'Refund Amount'}
                    </span>
                    <span className="font-receipt text-2xl font-semibold text-stamp">
                      <Currency amount={calculateRefundAmount(currentRefundTransaction)} />
                    </span>
                  </div>
                  <p className="font-receipt text-xs text-ink/70 mt-1">
                    {(dict.pos?.refundItemsSelected || '{count} selected for refund').replace('{count}', String(refundItems.length))}
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onCloseFull}
                  className="px-4 py-2.5 border border-ink/25 bg-paper-white text-ink hover:border-ink font-receipt text-sm font-medium uppercase transition-colors"
                >
                  {dict.common.cancel}
                </button>
                <button
                  type="button"
                  onClick={onProcessRefund}
                  disabled={refunding || refundItems.length === 0}
                  className="px-4 py-2.5 bg-stamp text-paper-white hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed font-receipt text-sm font-medium uppercase transition-colors"
                >
                  {refunding ? dict.pos.processing : dict.pos.processRefund}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
