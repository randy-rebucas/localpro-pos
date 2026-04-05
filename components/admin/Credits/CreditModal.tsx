'use client';

import { useState } from 'react';
import Currency from '@/components/Currency';

interface CreditModalProps {
  isOpen: boolean;
  mode: 'add' | 'adjust' | 'refund';
  amount: string;
  reason: string;
  submitting: boolean;
  primaryColor: string;
  onAmountChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export function CreditModal({
  isOpen,
  mode,
  amount,
  reason,
  submitting,
  primaryColor,
  onAmountChange,
  onReasonChange,
  onSubmit,
  onClose,
}: CreditModalProps) {
  if (!isOpen) return null;

  const modeLabels = {
    add: 'Add Credits',
    adjust: 'Adjust Balance',
    refund: 'Process Refund',
  };

  return (
    <div
      className="fixed inset-0 bg-gray-900/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-lg max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900 capitalize">
            {modeLabels[mode]}
          </h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Reason (optional)</label>
            <textarea
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="Why is this credit being added/adjusted?"
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="p-6 border-t border-gray-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-md hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={submitting || !amount}
            className="flex-1 px-4 py-2 text-white font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            style={{ backgroundColor: primaryColor }}
            onMouseEnter={(e) => {
              if (!submitting) e.currentTarget.style.backgroundColor = `${primaryColor}dd`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = primaryColor;
            }}
          >
            {submitting ? 'Processing...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
