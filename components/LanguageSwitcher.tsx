'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';

type Locale = 'en' | 'es';

const LOCALES: { code: Locale; label: string; flag: string }[] = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
];

const STORAGE_KEY = 'preferred_lang';

interface LanguageSwitcherProps {
  /** Current locale — provide when inside a [tenant]/[lang] route */
  lang?: Locale;
  /** Current tenant slug — provide when inside a [tenant]/[lang] route */
  tenant?: string;
  /** Optional CSS class override for the trigger button */
  className?: string;
}

/**
 * Compact language switcher.
 *
 * - When `tenant` + `lang` are provided it navigates to the same path with the
 *   new locale (e.g. /mystore/en/products → /mystore/es/products).
 * - On public pages (no tenant/lang) it persists the preference to localStorage
 *   so it is picked up when the user later enters a store.
 */
export default function LanguageSwitcher({ lang, tenant, className }: LanguageSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Locale>(lang ?? 'en');
  const ref = useRef<HTMLDivElement>(null);

  // On public pages (no lang prop) read the stored preference
  useEffect(() => {
    if (!lang) {
      const stored = (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY)) as Locale | null;
      if (stored === 'en' || stored === 'es') setCurrent(stored);
    }
  }, [lang]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleSelect = (locale: Locale) => {
    setOpen(false);
    if (locale === current) return;

    if (tenant && lang) {
      // Authenticated / tenant page: swap lang segment in the URL
      const newPath = pathname.replace(`/${tenant}/${lang}`, `/${tenant}/${locale}`);
      router.push(newPath);
    } else {
      // Public page: store preference, update local state, and notify same-tab listeners
      localStorage.setItem(STORAGE_KEY, locale);
      setCurrent(locale);
      window.dispatchEvent(new CustomEvent('preferred_lang_change', { detail: locale }));
    }
  };

  const currentLocale = LOCALES.find((l) => l.code === current) ?? LOCALES[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Switch language"
        aria-expanded={open}
        aria-haspopup="listbox"
        className={
          className ??
          'flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors'
        }
      >
        {/* Globe icon */}
        <svg className="w-4 h-4 flex-shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
        </svg>
        <span className="uppercase tracking-wide">{currentLocale.code}</span>
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Select language"
          className="absolute right-0 mt-1 w-36 bg-white border border-gray-300 shadow-lg z-50 py-1"
        >
          {LOCALES.map((locale) => (
            <li key={locale.code}>
              <button
                role="option"
                aria-selected={locale.code === current}
                onClick={() => handleSelect(locale.code)}
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                  locale.code === current
                    ? 'bg-brand-soft text-brand-navy font-semibold'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="text-base leading-none">{locale.flag}</span>
                <span>{locale.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
