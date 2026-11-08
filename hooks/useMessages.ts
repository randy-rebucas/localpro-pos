'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';

type Dict = Record<string, Record<string, unknown> | undefined>;

/**
 * A translator for messages a hook shows (toasts, inline errors), so hooks
 * don't need their page to pass the dictionary in. Loads the tenant
 * dictionary for the route's language; until it arrives (or for a missing
 * key) the English fallback is used.
 *
 * `t('admin.discountCreated', 'Discount created')` — section.key, then fallback.
 * The returned function is stable, so it can sit in useCallback deps.
 */
export function useMessages(): (path: string, fallback: string) => string {
  const params = useParams();
  const lang = params?.lang === 'es' ? 'es' : 'en';
  const dictRef = useRef<Dict | null>(null);

  useEffect(() => {
    let live = true;
    getDictionaryClient(lang)
      .then((dict: Dict) => {
        if (live) dictRef.current = dict;
      })
      .catch(() => {
        // keep the English fallbacks
      });
    return () => {
      live = false;
    };
  }, [lang]);

  return useCallback((path: string, fallback: string) => {
    const dot = path.indexOf('.');
    const value = dictRef.current?.[path.slice(0, dot)]?.[path.slice(dot + 1)];
    return typeof value === 'string' && value ? value : fallback;
  }, []);
}
