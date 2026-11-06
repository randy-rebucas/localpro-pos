'use client';

import { useCallback, useEffect, useState } from 'react';
import { getDictionaryClient } from '@/app/[lang]/dictionaries-client';
import type { Translate } from '@/components/marketing/primitives';
import { usePublicLang } from './usePublicLang';

type Dictionary = Record<string, Record<string, string> | undefined>;

/** Loads public copy for the current language. `t` reads `section`; `shellT` reads the header and footer copy. */
export function usePublicCopy(section: string) {
  const lang = usePublicLang();
  const [dict, setDict] = useState<Dictionary>();

  useEffect(() => {
    let cancelled = false;
    getDictionaryClient(lang).then((loaded) => {
      if (!cancelled) setDict(loaded as unknown as Dictionary);
    });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  const t = useCallback<Translate>((key, fallback) => dict?.[section]?.[key] ?? fallback, [dict, section]);
  const shellT = useCallback<Translate>((key, fallback) => dict?.home?.[key] ?? fallback, [dict]);

  return { lang, t, shellT };
}
