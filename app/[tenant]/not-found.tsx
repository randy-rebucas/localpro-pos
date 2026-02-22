'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';

export default function TenantNotFound() {
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  useEffect(() => {
    getDictionaryClient('en').then(setDict);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white p-8 text-center">
        <div className="mb-6">
          <svg
            className="mx-auto h-16 w-16 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{dict?.common?.storeNotFound || 'Store Not Found'}</h1>
        <p className="text-gray-600 mb-6">
          {dict?.common?.storeNotFoundMessage || "The store you're looking for doesn't exist or has been deactivated."}
        </p>
        <div className="space-y-3">
          <Link
            href="/default/en"
            className="block w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 font-medium transition-colors"
          >
            {dict?.common?.goToDefaultStore || 'Go to Default Store'}
          </Link>
          <Link
            href="/"
            className="block w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 font-medium transition-colors"
          >
            {dict?.common?.goToHome || 'Go to Home'}
          </Link>
        </div>
      </div>
    </div>
  );
}

