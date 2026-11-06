'use client';

import { useState, useCallback } from 'react';
import { planRefund, refundAmountFor, RefundPlanError, saleLineKey } from '@/lib/refund-plan';

interface RefundItem {
  productId: string;
  refundQty: number;
  refundReason: string;
}

interface TransactionItem {
  productId?: string;
  name: string;
  price: number;
  quantity: number;
  refundedQuantity?: number;
  product?: unknown;
  _id?: string;
}

const isLineFor = (item: TransactionItem, productId: string) => saleLineKey(item) === productId;

interface RefundTransaction {
  _id?: string;
  id?: string;
  items: TransactionItem[];
  subtotal?: number;
  refundedAmount?: number;
  receiptNumber?: string;
  createdAt?: string;
  total?: number;
  status?: string;
}

interface RefundResult {
  success: boolean;
  error?: string;
  errors?: string[];
  data?: unknown;
}

/**
 * Custom hook for refund processing
 * Handles partial and full refunds with validation
 */
export function useRefund() {
  const [currentRefundTransaction, setCurrentRefundTransaction] = useState<RefundTransaction | null>(null);
  const [refundItems, setRefundItems] = useState<RefundItem[]>([]);
  const [refundMethod, setRefundMethod] = useState<string>('cash');
  const [refundNotes, setRefundNotes] = useState<string>('');
  const [refunding, setRefunding] = useState(false);

  const addRefundItem = useCallback((productId: string, maxQty: number) => {
    setRefundItems(prev => {
      const existing = prev.find(item => item.productId === productId);
      if (existing) {
        return prev.map(item =>
          item.productId === productId
            ? { ...item, refundQty: Math.min(item.refundQty + 1, maxQty) }
            : item
        );
      }
      return [...prev, { productId, refundQty: 1, refundReason: 'Customer Request' }];
    });
  }, []);

  const removeRefundItem = useCallback((productId: string) => {
    setRefundItems(prev => prev.filter(item => item.productId !== productId));
  }, []);

  const updateRefundQty = useCallback((productId: string, qty: number, maxQty: number) => {
    setRefundItems(prev =>
      prev.map(item =>
        item.productId === productId
          ? { ...item, refundQty: Math.min(Math.max(qty, 0), maxQty) }
          : item
      )
    );
  }, []);

  const updateRefundReason = useCallback((productId: string, reason: string) => {
    setRefundItems(prev =>
      prev.map(item =>
        item.productId === productId
          ? { ...item, refundReason: reason }
          : item
      )
    );
  }, []);

  const calculateRefundAmount = useCallback((originalTransaction: RefundTransaction | null) => {
    const selectedItems = refundItems.filter((item) => item.refundQty > 0);
    if (!originalTransaction || !selectedItems.length) return 0;

    // Same maths as the server, so the amount shown is the amount refunded
    try {
      const plan = planRefund(
        originalTransaction.items.map((item) => ({ ...item, product: saleLineKey(item) })),
        selectedItems.map((item) => ({ productId: item.productId, quantity: item.refundQty }))
      );
      return refundAmountFor({
        linesValue: plan.subtotal,
        saleSubtotal: originalTransaction.subtotal ?? 0,
        saleTotal: originalTransaction.total ?? 0,
        alreadyRefunded: originalTransaction.refundedAmount,
        isFullRefund: plan.isFullRefund,
      });
    } catch (error) {
      if (error instanceof RefundPlanError) return 0;
      throw error;
    }
  }, [refundItems]);

  const validateRefund = useCallback((originalTransaction: RefundTransaction | null): string[] => {
    const errors: string[] = [];

    if (!originalTransaction) {
      errors.push('No transaction selected for refund');
    }

    // A line set to 0 is simply left out of the refund
    const selectedItems = refundItems.filter((item) => item.refundQty > 0);
    if (!selectedItems.length) {
      errors.push('No items selected for refund');
    }

    if (!refundMethod) {
      errors.push('Refund method is required');
    }

    // Validate quantities
    selectedItems.forEach(refundItem => {
      const originalItem = originalTransaction?.items.find(
        (item: TransactionItem) => isLineFor(item, refundItem.productId)
      );
      if (originalItem && refundItem.refundQty > originalItem.quantity) {
        errors.push(`Cannot refund more than ${originalItem.quantity} units of ${originalItem.name}`);
      }
    });

    return errors;
  }, [refundItems, refundMethod]);

  const processRefund = useCallback(
    async (
      originalTransaction: RefundTransaction | null,
      fetchWithTimeout: (url: string, options?: RequestInit) => Promise<Response>
    ): Promise<RefundResult> => {
      const validationErrors = validateRefund(originalTransaction);
      if (validationErrors.length > 0) {
        return { success: false, errors: validationErrors };
      }

      setRefunding(true);
      try {
        if (!originalTransaction) {
          return { success: false, error: 'No transaction selected for refund' };
        }
        const selectedItems = refundItems.filter((item) => item.refundQty > 0);
        const transactionId = originalTransaction._id || originalTransaction.id;
        const response = await fetchWithTimeout(`/api/transactions/${transactionId}/refund`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: selectedItems.map((item) => ({ productId: item.productId, quantity: item.refundQty })),
            reason: selectedItems[0]?.refundReason,
            notes: refundNotes,
          })
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || `Refund failed: ${response.status}`);
        }

        // Reset refund state
        setRefundItems([]);
        setRefundMethod('cash');
        setRefundNotes('');
        setCurrentRefundTransaction(null);

        return { success: true, data: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to process refund';
        return { success: false, error: message };
      } finally {
        setRefunding(false);
      }
    },
    [validateRefund, refundItems, refundNotes]
  );

  const clearRefund = useCallback(() => {
    setRefundItems([]);
    setRefundMethod('cash');
    setRefundNotes('');
    setCurrentRefundTransaction(null);
  }, []);

  return {
    // State
    currentRefundTransaction,
    setCurrentRefundTransaction,
    refundItems,
    setRefundItems,
    refundMethod,
    setRefundMethod,
    refundNotes,
    setRefundNotes,
    refunding,
    
    // Methods
    addRefundItem,
    removeRefundItem,
    updateRefundQty,
    updateRefundReason,
    calculateRefundAmount,
    validateRefund,
    processRefund,
    clearRefund
  };
}
