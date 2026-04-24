'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';

type Locale = 'en' | 'es';

function resolveLang(paramLang: unknown): Locale {
  if (paramLang === 'en' || paramLang === 'es') return paramLang;
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('preferred_lang');
    if (stored === 'en' || stored === 'es') return stored;
  }
  return 'en';
}

export default function TenantError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams();
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  useEffect(() => {
    console.error('Tenant error:', error);
    const lang = resolveLang(params?.lang);
    getDictionaryClient(lang).then(setDict);
  }, [error, params?.lang]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white p-8 text-center">
        <div className="mb-6">
          <svg
            className="mx-auto h-16 w-16 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {dict?.admin?.errorLoadingStore || 'Error Loading Store'}
        </h1>
        <p className="text-gray-600 mb-6">
          {error.message || dict?.admin?.errorLoadingStoreMessage || 'An error occurred while loading the store information.'}
        </p>
        <div className="space-y-3">
          <button
            onClick={reset}
            className="w-full bg-brand text-white px-4 py-2 rounded-md hover:bg-brand-hover font-medium transition-colors"
          >
            {dict?.admin?.tryAgain || 'Try Again'}
          </button>
          <Link
            href="/default/en"
            className="block w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 font-medium transition-colors"
          >
            {dict?.admin?.goToDefaultStore || 'Go to Default Store'}
          </Link>
        </div>
      </div>
    </div>
  );
}
