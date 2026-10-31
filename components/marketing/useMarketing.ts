'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { getDictionaryClient } from '@/app/[lang]/dictionaries-client';

/** `home` slice of the app dictionary; every consumer falls back to English when a key is missing. */
export type HomeDict = Record<string, string> | undefined;

type Lang = 'en' | 'es';
const isLang = (v: unknown): v is Lang => v === 'en' || v === 'es';

function subscribeLang(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === 'preferred_lang') onChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener('preferred_lang_change', onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('preferred_lang_change', onChange);
  };
}

function readLang(): Lang {
  try {
    const stored = localStorage.getItem('preferred_lang');
    return isLang(stored) ? stored : 'en';
  } catch {
    return 'en';
  }
}

/** Follows the `preferred_lang` localStorage key (and same-tab `preferred_lang_change` events). */
export function useHomeDict(): HomeDict {
  const lang = useSyncExternalStore(subscribeLang, readLang, () => 'en' as Lang);
  const [dict, setDict] = useState<HomeDict>(undefined);

  useEffect(() => {
    getDictionaryClient(lang).then((all) => setDict((all as { home?: Record<string, string> }).home));
  }, [lang]);

  return dict;
}

export type PlatformStats = { activeTenants: number; completedTransactions: number } | 'loading' | 'failed';

export function usePlatformStats(): PlatformStats {
  const [stats, setStats] = useState<PlatformStats>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/public/platform-stats');
        const json = await res.json();
        if (cancelled) return;
        if (!json?.success || !json?.data) {
          setStats('failed');
          return;
        }
        setStats({
          activeTenants: Number(json.data.activeTenants) || 0,
          completedTransactions: Number(json.data.completedTransactions) || 0,
        });
      } catch {
        if (!cancelled) setStats('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return stats;
}
