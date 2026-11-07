import { useState, useRef, useCallback } from 'react';
import { getOfflineStorage } from '@/lib/offline-storage';
import { discountFor, type TaxPricingSettings } from '@/lib/tax-pricing';

export interface Discount {
  code: string;
  amount: number;
  name?: string;
  /** Senior and PWD sales carry no VAT, so the cart has to know. */
  category?: string;
}

interface UseDiscountReturn {
  promoCode: string;
  setPromoCode: (code: string) => void;
  appliedDiscount: Discount | null;
  setAppliedDiscount: (discount: Discount | null) => void;
  applyingDiscount: boolean;
  applyDiscount: (subtotal: number, tenant: string, onSuccess: (discount: Discount) => void, onError: (msg: string) => void, settings?: TaxPricingSettings | null) => Promise<void>;
  removeDiscount: () => void;
}

export function useDiscount(fetchWithTimeout: (url: string, options?: RequestInit, timeoutMs?: number) => Promise<Response>): UseDiscountReturn {
  const [promoCode, setPromoCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<Discount | null>(null);
  const [applyingDiscount, setApplyingDiscount] = useState(false);
  
  const discountTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const discountAbortRef = useRef<AbortController | null>(null);

  const applyDiscount = useCallback(
    async (subtotal: number, tenant: string, onSuccess: (discount: Discount) => void, onError: (msg: string) => void, settings?: TaxPricingSettings | null) => {
      if (!promoCode.trim() || applyingDiscount) return;

      // Clear previous timeout to debounce
      if (discountTimeoutRef.current) {
        clearTimeout(discountTimeoutRef.current);
      }

      discountTimeoutRef.current = setTimeout(async () => {
        // Cancel previous request
        if (discountAbortRef.current) {
          discountAbortRef.current.abort();
        }

        setApplyingDiscount(true);
        try {
          discountAbortRef.current = new AbortController();

          // Try online validation first
          if (navigator.onLine) {
            const res = await fetchWithTimeout(
              `/api/discounts/validate?tenant=${tenant}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: discountAbortRef.current.signal,
                body: JSON.stringify({ code: promoCode, subtotal }),
              }
            );

            const data = await res.json();
            if (data.success) {
              const discount = {
                code: data.data.code,
                amount: data.data.discountAmount,
                name: data.data.name,
                category: data.data.category,
              };
              setAppliedDiscount(discount);
              setPromoCode('');
              onSuccess(discount);
              return;
            } else {
              onError(data.error || 'Invalid discount code');
              return;
            }
          }

          // Offline fallback
          const storage = await getOfflineStorage();
          const cachedDiscount = await storage.getCachedDiscountByCode(promoCode.toUpperCase(), tenant);

          if (cachedDiscount) {
            const now = new Date();
            const validFrom = cachedDiscount.validFrom || cachedDiscount.startDate;
            const validUntil = cachedDiscount.validUntil || cachedDiscount.endDate;

            if (validFrom && new Date(validFrom) > now) {
              onError('Discount not yet active');
              return;
            }
            if (validUntil && new Date(validUntil) < now) {
              onError('Discount expired');
              return;
            }
            if (cachedDiscount.minPurchaseAmount && subtotal < cachedDiscount.minPurchaseAmount) {
              onError('Minimum purchase not met');
              return;
            }

            const discount: Discount = {
              code: cachedDiscount.code,
              amount: discountFor(cachedDiscount, subtotal, settings, cachedDiscount).amount,
              name: cachedDiscount.name,
              category: cachedDiscount.category,
            };

            setAppliedDiscount(discount);
            setPromoCode('');
            onSuccess(discount);
          } else {
            onError('Invalid discount code');
          }
        } catch (error: unknown) {
          if (error instanceof Error && error.name === 'AbortError') {
            return; // User is still typing
          }
          onError('Error applying discount');
        } finally {
          setApplyingDiscount(false);
        }
      }, 300); // 300ms debounce
    },
    [promoCode, applyingDiscount, fetchWithTimeout]
  );

  const removeDiscount = useCallback(() => {
    setAppliedDiscount(null);
    setPromoCode('');
  }, []);

  return {
    promoCode,
    setPromoCode,
    appliedDiscount,
    setAppliedDiscount,
    applyingDiscount,
    applyDiscount,
    removeDiscount,
  };
}
