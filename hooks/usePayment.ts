import { useState, useCallback } from 'react';
import { CartItem } from './useCart';
import { Discount } from './useDiscount';

interface PaymentInputData {
  items: Array<{ productId: string; quantity: number }>;
  paymentMethod: 'cash' | 'card' | 'digital';
  cashReceived?: number;
  discountCode?: string;
}

export interface PaymentResult {
  success: boolean;
  error?: string;
  errors?: Array<{ field: string; message: string }>;
  data?: any;
}

interface UsePaymentReturn {
  paymentMethod: 'cash' | 'card' | 'digital';
  setPaymentMethod: (method: 'cash' | 'card' | 'digital') => void;
  cashReceived: string;
  setCashReceived: (amount: string) => void;
  processing: boolean;
  processPayment: (
    cart: CartItem[],
    appliedDiscount: Discount | null,
    total: number,
    tenant: string,
    onValidationError: (msg: string) => void,
    fetchWithTimeout: (url: string, options?: RequestInit, timeoutMs?: number) => Promise<Response>
  ) => Promise<PaymentResult | null>;
}

export function usePayment(): UsePaymentReturn {
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'digital'>('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [processing, setProcessing] = useState(false);

  const validatePayment = useCallback(
    (cart: CartItem[], total: number, method: string, cash: string, onError: (msg: string) => void): boolean => {
      // Validate cart
      if (cart.length === 0) {
        onError('Cart is empty');
        return false;
      }

      // Validate payment method
      const validMethods = ['cash', 'card', 'digital'];
      if (!validMethods.includes(method)) {
        onError(`Invalid payment method: ${method}`);
        console.error('Invalid paymentMethod state:', method);
        return false;
      }

      // Validate cash payment
      if (method === 'cash') {
        const cashAmount = parseFloat(cash);
        if (isNaN(cashAmount)) {
          onError('Please enter a valid cash amount');
          return false;
        }
        if (cashAmount < total) {
          onError('Insufficient cash');
          return false;
        }
      }

      // Validate cart items
      const validItems = cart.every(
        (item) =>
          item.productId &&
          typeof item.productId === 'string' &&
          typeof item.quantity === 'number' &&
          item.quantity > 0
      );

      if (!validItems) {
        const badItems = cart.filter(
          (item) => !item.productId || typeof item.quantity !== 'number' || item.quantity <= 0
        );
        console.error('Invalid cart items:', badItems);
        onError('Cart contains invalid items');
        return false;
      }

      return true;
    },
    []
  );

  const processPayment = useCallback(
    async (
      cart: CartItem[],
      appliedDiscount: Discount | null,
      total: number,
      tenant: string,
      onValidationError: (msg: string) => void,
      fetchWithTimeout: (url: string, options?: RequestInit, timeoutMs?: number) => Promise<Response>
    ): Promise<PaymentResult | null> => {
      // Validate before processing
      if (!validatePayment(cart, total, paymentMethod, cashReceived, onValidationError)) {
        return null;
      }

      setProcessing(true);
      try {
        const payload: PaymentInputData = {
          items: cart.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
          paymentMethod,
          cashReceived: paymentMethod === 'cash' ? parseFloat(cashReceived) : undefined,
          discountCode: appliedDiscount?.code,
        };

        const res = await fetchWithTimeout(
          `/api/transactions?tenant=${tenant}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
          30000 // 30s timeout for transactions
        );

        const data = await res.json();
        return data;
      } catch (error: unknown) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to process payment',
        };
      } finally {
        setProcessing(false);
      }
    },
    [paymentMethod, cashReceived, validatePayment]
  );

  return {
    paymentMethod,
    setPaymentMethod,
    cashReceived,
    setCashReceived,
    processing,
    processPayment,
  };
}
