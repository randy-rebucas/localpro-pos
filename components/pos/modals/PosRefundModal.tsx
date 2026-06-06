'use client';

import Currency from '@/components/Currency';
import { formatDateTime } from '@/lib/formatting';
import { getDefaultTenantSettings } from '@/lib/currency';
import type { TranslationDict } from '@/types/dictionary';
import type { ITenantSettings } from '@/types/tenant';

export interface RefundTransactionItem {
  product: string | { toString(): string };
  name: string;
  price: number;
  quantity: number;
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
      className="fixed inset-0 bg-gray-900/30 backdrop-blur-md z-50"
      onClick={onClose}
    >
      <div
        className="absolute inset-y-0 right-0 w-full max-w-2xl bg-white border-l border-gray-300 flex flex-col animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 sm:p-6 border-b border-gray-200">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{dict.pos.refundTransaction}</h2>
          <button
            onClick={onCloseFull}
            className="text-gray-400 hover:text-gray-600 transition-colors"
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {dict.pos.transactionId} / {dict.pos.receiptNumber}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={refundTransactionId}
                    onChange={(e) => setRefundTransactionId(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && onLookupTransaction()}
                    className="flex-1 px-4 py-3 text-base border-2 border-gray-300 transition-all"
                    placeholder={dict.pos.transactionId}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = primaryColor;
                      e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}30`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                  <button
                    type="button"
                    onClick={onLookupTransaction}
                    disabled={!refundTransactionId.trim()}
                    className="px-4 py-3 text-white font-medium transition-colors border disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: primaryColor,
                      borderColor: primaryColor,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${primaryColor}dd`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = primaryColor; }}
                  >
                    {dict.pos.lookupTransaction}
                  </button>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 border-2 border-gray-300 text-gray-700 hover:bg-gray-100 font-medium transition-colors bg-white"
                >
                  {dict.common.cancel}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-5 p-4 bg-gray-50 border border-gray-300">
                <div className="text-sm text-gray-600 mb-1">{dict.pos.receiptNumber}</div>
                <div className="font-semibold text-lg">{refundTransaction.receiptNumber || refundTransaction._id}</div>
                <div className="text-sm text-gray-600 mt-2">
                  {formatDateTime(new Date(refundTransaction.createdAt || new Date()), settings || getDefaultTenantSettings())}
                </div>
                <div className="text-sm text-gray-600">
                  {dict.common.total}: <Currency amount={refundTransaction.total || 0} />
                </div>
              </div>

              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {dict.pos.selectItemsToRefund}
                </label>
                <div className="space-y-3 max-h-64 overflow-y-auto border border-gray-300 p-3">
                  {refundTransaction.items.map((item) => {
                    const productId = item.product.toString();
                    const maxQty = item.quantity;
                    const refundItem = refundItems.find((ri) => ri.productId === productId);
                    const currentQty: number = refundItem?.refundQty || 0;

                    return (
                      <div key={productId} className="flex items-center justify-between p-2 hover:bg-gray-50 border-b border-gray-200 last:border-b-0">
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{item.name}</div>
                          <div className="text-sm text-gray-500">
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
                            className="px-3 py-1 border border-gray-300 hover:bg-gray-100"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min="0"
                            max={maxQty}
                            value={currentQty}
                            aria-label={`Refund quantity for ${item.name}`}
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
                            className="w-16 px-2 py-2 text-center border border-gray-300"
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
                            className="px-3 py-2 border border-gray-300 hover:bg-gray-100"
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
                            className="ml-2 px-2 py-1 text-xs border"
                            style={{
                              backgroundColor: `${primaryColor}15`,
                              borderColor: primaryColor,
                              color: primaryColor,
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${primaryColor}25`; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = `${primaryColor}15`; }}
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {dict.pos.refundReason}
                </label>
                <input
                  type="text"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="w-full px-4 py-3 text-base border-2 border-gray-300 transition-all"
                  placeholder={dict?.pos?.refundReasonPlaceholder || 'Reason for refund'}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = primaryColor;
                    e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}30`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>

              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {dict.pos.refundNotes}
                </label>
                <textarea
                  value={refundNotes}
                  onChange={(e) => setRefundNotes(e.target.value.slice(0, maxRefundNotesLength))}
                  maxLength={maxRefundNotesLength}
                  rows={3}
                  className="w-full px-4 py-3 text-base border-2 border-gray-300 transition-all"
                  placeholder={dict?.pos?.refundNotesPlaceholder || 'Additional notes'}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = primaryColor;
                    e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}30`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>

              {refundItems.length > 0 && currentRefundTransaction && (
                <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-red-800">
                      {dict.pos?.refundAmount || 'Refund Amount'}
                    </span>
                    <span className="text-lg font-bold text-red-700">
                      <Currency amount={calculateRefundAmount(currentRefundTransaction)} />
                    </span>
                  </div>
                  <p className="text-xs text-red-600 mt-1">
                    {refundItems.length} {refundItems.length === 1 ? 'item' : 'items'} selected for refund
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onCloseFull}
                  className="px-4 py-2.5 border-2 border-gray-300 text-gray-700 hover:bg-gray-100 font-medium transition-colors bg-white"
                >
                  {dict.common.cancel}
                </button>
                <button
                  type="button"
                  onClick={onProcessRefund}
                  disabled={refunding || refundItems.length === 0}
                  className="px-4 py-2.5 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors border border-red-700"
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
