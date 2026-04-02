'use client';

import { useEffect, useState, useRef } from 'react';

export interface UpsellProduct {
  productId: string;
  name: string;
  price: number;
  stock: number;
  image: string | null;
  category: string | null;
}

export function useUpsell(tenant: string, cartProductIds: string[]) {
  const [suggestions, setSuggestions] = useState<UpsellProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!tenant || cartProductIds.length === 0) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const ids = cartProductIds.join(',');
        const res = await fetch(`/api/insights/upsell?tenant=${tenant}&productIds=${ids}`, {
          credentials: 'include',
        });
        if (!res.ok) return;
        const json = await res.json();
        if (json.success) setSuggestions(json.data as UpsellProduct[]);
      } catch {
        // silently fail — upsell is non-critical
      } finally {
        setLoading(false);
      }
    }, 600);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, cartProductIds.join(',')]);

  return { suggestions, loading };
}
