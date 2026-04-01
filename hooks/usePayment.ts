import { useState, useCallback } from 'react';
import { CartItem } from './useCart';
import { Discount } from './useDiscount';

export type PaymentMethodType =
  | 'cash'
  | 'card'
  | 'tap_to_pay'
  | 'wallet'
  | 'qr_code'
  | 'bnpl'
  | 'digital'; // kept for backwards compatibility

interface PaymentInputData {
  items: Array<{ productId: string; quantity: number }>;
  paymentMethod: PaymentMethodType;
  cashReceived?: number;
  discountCode?: string;
  paymentProvider?: string;
  paymentReference?: string;
  bnplInstallments?: number;
}

export interface PaymentResult {
  success: boolean;
  error?: string;
  errors?: Array<{ field: string; message: string }>;
  data?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

interface UsePaymentReturn {
  paymentMethod: PaymentMethodType;
  setPaymentMethod: (method: PaymentMethodType) => void;
  cashReceived: string;
  setCashReceived: (amount: string) => void;
  paymentProvider: string;
  setPaymentProvider: (provider: string) => void;
  paymentReference: string;
  setPaymentReference: (ref: string) => void;
  bnplInstallments: number;
  setBnplInstallments: (n: number) => void;
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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [paymentProvider, setPaymentProvider] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [bnplInstallments, setBnplInstallments] = useState(3);
  const [processing, setProcessing] = useState(false);

  const validatePayment = useCallback(
    (
      cart: CartItem[],
      total: number,
      method: PaymentMethodType,
      cash: string,
      provider: string,
      onError: (msg: string) => void
    ): boolean => {
      if (cart.length === 0) {
        onError('Cart is empty');
        return false;
      }

      const validMethods: PaymentMethodType[] = ['cash', 'card', 'tap_to_pay', 'wallet', 'qr_code', 'bnpl', 'digital'];
      if (!validMethods.includes(method)) {
        onError(`Invalid payment method: ${method}`);
        return false;
      }

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

      if ((method === 'wallet' || method === 'bnpl') && !provider) {
        onError(`Please select a ${method === 'bnpl' ? 'BNPL' : 'wallet'} provider`);
        return false;
      }

      const validItems = cart.every(
        (item) =>
          item.productId &&
          typeof item.productId === 'string' &&
          typeof item.quantity === 'number' &&
          item.quantity > 0
      );
      if (!validItems) {
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
      if (!validatePayment(cart, total, paymentMethod, cashReceived, paymentProvider, onValidationError)) {
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
          paymentProvider: paymentProvider || undefined,
          paymentReference: paymentReference || undefined,
          bnplInstallments: paymentMethod === 'bnpl' ? bnplInstallments : undefined,
        };

        const res = await fetchWithTimeout(
          `/api/transactions?tenant=${tenant}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
          30000
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
    [paymentMethod, cashReceived, paymentProvider, paymentReference, bnplInstallments, validatePayment]
  );

  return {
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
    processing,
    processPayment,
  };
}
