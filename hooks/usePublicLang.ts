'use client';

import { useSyncExternalStore } from 'react';

export type PublicLang = 'en' | 'es';

const STORAGE_KEY = 'preferred_lang';
const CHANGE_EVENT = 'preferred_lang_change';

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function readLang(): PublicLang {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'es' ? 'es' : 'en';
  } catch {
    return 'en';
  }
}

/** Language for public pages, shared with the store picker through localStorage. */
export function usePublicLang(): PublicLang {
  return useSyncExternalStore(subscribe, readLang, () => 'en');
}

export function setPublicLang(lang: PublicLang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Storage can be blocked; the event still updates this page.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: lang }));
}
