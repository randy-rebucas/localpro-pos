'use client';

import { useState, useCallback } from 'react';

interface RefundItem {
  productId: string;
  refundQty: number;
  refundReason: string;
}

interface RefundData {
  items: RefundItem[];
  refundMethod: string;
  notes: string;
}

interface TransactionItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  product?: string;
}

interface RefundTransaction {
  _id?: string;
  id?: string;
  items: TransactionItem[];
  discountAmount?: number;
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
    if (!originalTransaction || !refundItems.length) return 0;

    let amount = 0;
    refundItems.forEach(refundItem => {
      const originalItem = originalTransaction.items.find(
        (item: TransactionItem) => item.productId === refundItem.productId
      );
      if (originalItem) {
        amount += originalItem.price * refundItem.refundQty;
      }
    });

    // Apply original discount proportionally
    if (originalTransaction.discountAmount && originalTransaction.items.length > 0) {
      const discountRatio = refundItems.reduce((sum: number, ri) => {
        const originalItem = originalTransaction.items.find(
          (item: TransactionItem) => item.productId === ri.productId
        );
        return sum + (originalItem ? ri.refundQty : 0);
      }, 0) / originalTransaction.items.reduce((sum: number, item: TransactionItem) => sum + item.quantity, 0);
      amount -= (originalTransaction.discountAmount * discountRatio);
    }

    return Math.max(0, amount);
  }, [refundItems]);

  const validateRefund = useCallback((originalTransaction: RefundTransaction | null): string[] => {
    const errors: string[] = [];

    if (!originalTransaction) {
      errors.push('No transaction selected for refund');
    }

    if (!refundItems.length) {
      errors.push('No items selected for refund');
    }

    if (!refundMethod) {
      errors.push('Refund method is required');
    }

    // Validate quantities
    refundItems.forEach(refundItem => {
      const originalItem = originalTransaction?.items.find(
        (item: TransactionItem) => item.productId === refundItem.productId
      );
      if (originalItem && refundItem.refundQty > originalItem.quantity) {
        errors.push(`Cannot refund more than ${originalItem.quantity} units of ${originalItem.name}`);
      }
      if (refundItem.refundQty <= 0) {
        errors.push('Refund quantity must be greater than 0');
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
        const refundAmount = calculateRefundAmount(originalTransaction);
        const refundData: RefundData = {
          items: refundItems,
          refundMethod,
          notes: refundNotes
        };

        if (!originalTransaction) {
          return { success: false, error: 'No transaction selected for refund' };
        }
        const response = await fetchWithTimeout('/api/refunds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            originalTransactionId: originalTransaction.id,
            amount: refundAmount,
            ...refundData
          })
        });

        if (!response.ok) {
          throw new Error(`Refund failed: ${response.status}`);
        }

        const result = await response.json();

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
    [validateRefund, calculateRefundAmount, refundItems, refundMethod, refundNotes]
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
