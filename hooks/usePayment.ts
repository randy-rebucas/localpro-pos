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
  | 'digital' // kept for backwards compatibility
  | 'on_account';

export interface SplitPaymentEntry {
  guestIndex: number;
  method: string;
  amount: number;
  reference?: string;
}

export interface RestaurantMeta {
  orderType?: string;
  tableNumber?: string;
  tableId?: string;
}

interface PaymentInputData {
  items: Array<{
    productId: string;
    quantity: number;
    variation?: { size?: string; color?: string; type?: string };
    modifiers?: Array<{ name: string; chosenOption: string; price: number }>;
  }>;
  paymentMethod: PaymentMethodType;
  cashReceived?: number;
  discountCode?: string;
  paymentProvider?: string;
  paymentReference?: string;
  bnplInstallments?: number;
  customerId?: string;
  orderType?: string;
  tableNumber?: string;
  tableId?: string;
  splitCount?: number;
  splitPayments?: SplitPaymentEntry[];
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
    fetchWithTimeout: (url: string, options?: RequestInit, timeoutMs?: number) => Promise<Response>,
    customerId?: string,
    restaurantMeta?: RestaurantMeta,
    splitPayments?: SplitPaymentEntry[]
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

      const validMethods: PaymentMethodType[] = [
        'cash', 'card', 'tap_to_pay', 'wallet', 'qr_code', 'bnpl', 'digital', 'on_account',
      ];
      if (!validMethods.includes(method)) {
        onError(`Invalid payment method: ${method}`);
        return false;
      }

      if (method === 'on_account') {
        // customerId checked in processPayment (needs tenant context)
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
      fetchWithTimeout: (url: string, options?: RequestInit, timeoutMs?: number) => Promise<Response>,
      customerId?: string,
      restaurantMeta?: RestaurantMeta,
      splitPayments?: SplitPaymentEntry[]
    ): Promise<PaymentResult | null> => {
      // For split payments, use the first guest's method for validation; skip cash check
      const methodForValidation = splitPayments ? (splitPayments[0]?.method as PaymentMethodType ?? paymentMethod) : paymentMethod;
      // When split, skip the cash-amount validation (each guest pays separately)
      const cashForValidation = splitPayments ? '999999' : cashReceived;

      if (!validatePayment(cart, total, methodForValidation, cashForValidation, paymentProvider, onValidationError)) {
        return null;
      }

      const hasOnAccount =
        paymentMethod === 'on_account' ||
        (splitPayments?.some((s) => s.method === 'on_account') ?? false);
      if (hasOnAccount && !customerId?.trim()) {
        onValidationError('Select a customer for on-account payment');
        return null;
      }

      setProcessing(true);
      try {
        // Determine the "primary" payment method: for splits, use most common method
        const primaryMethod: PaymentMethodType = splitPayments
          ? (splitPayments[0]?.method as PaymentMethodType ?? paymentMethod)
          : paymentMethod;

        const payload: PaymentInputData = {
          items: cart.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            variation: item.variation,
            modifiers: item.selectedModifiers,
          })),
          paymentMethod: primaryMethod,
          cashReceived: primaryMethod === 'cash' && !splitPayments ? parseFloat(cashReceived) : undefined,
          discountCode: appliedDiscount?.code,
          paymentProvider: paymentProvider || undefined,
          paymentReference: paymentReference || undefined,
          bnplInstallments: primaryMethod === 'bnpl' ? bnplInstallments : undefined,
          customerId: customerId || undefined,
          orderType: restaurantMeta?.orderType,
          tableNumber: restaurantMeta?.tableNumber,
          tableId: restaurantMeta?.tableId,
          splitCount: splitPayments ? splitPayments.length : undefined,
          splitPayments: splitPayments,
        };

        const bodyPayload: Record<string, unknown> = { ...payload, customerId: customerId || undefined };
        if (splitPayments?.length) {
          bodyPayload.payments = splitPayments.map((s) => ({
            method: s.method,
            amount: s.amount,
            notes: s.reference,
          }));
        }

        const res = await fetchWithTimeout(
          `/api/transactions?tenant=${tenant}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyPayload),
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
