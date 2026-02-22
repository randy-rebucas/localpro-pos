'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';

interface Tenant {
  slug: string;
  name: string;
  settings?: {
    companyName?: string;
  };
}

export default function RootNotFound() {
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDictionaryClient('en').then(setDict);
  }, []);

  useEffect(() => {
    async function fetchTenants() {
      try {
        const res = await fetch('/api/tenants');
        const data = await res.json();
        if (data.success && data.data) {
          setTenants(data.data);
        }
      } catch (error) {
        console.error('Error fetching tenants:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchTenants();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="max-w-2xl w-full bg-white border border-gray-300 p-8">
        <div className="text-center mb-8">
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
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">{dict?.common?.selectStore || 'Select a Store'}</h1>
          <p className="text-gray-600 text-lg">
            {dict?.common?.selectStoreMessage || 'Please select a store to continue. Choose from the available stores below or use the default store.'}
          </p>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">{dict?.common?.loadingStores || 'Loading stores...'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tenants.length > 0 ? (
              tenants.map((tenant) => (
                <Link
                  key={tenant.slug}
                  href={`/${tenant.slug}/en`}
                  className="block w-full bg-gray-50 hover:bg-gray-100 p-4 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900 text-lg">
                        {tenant.settings?.companyName || tenant.name}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {tenant.settings?.companyName ? tenant.name : `${dict?.common?.store || 'Store'}: ${tenant.slug}`}
                      </p>
                    </div>
                    <svg
                      className="h-5 w-5 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </Link>
              ))
            ) : (
              <div className="text-center py-6">
                <p className="text-gray-600 mb-4">{dict?.common?.noStoresAvailable || 'No stores available. Please contact your administrator.'}</p>
                <Link
                  href="/default/en"
                  className="inline-block bg-blue-600 text-white px-6 py-2 hover:bg-blue-700 font-medium transition-colors"
                >
                  {dict?.common?.goToDefaultStore || 'Go to Default Store'}
                </Link>
              </div>
            )}
          </div>
        )}

        {!loading && tenants.length > 0 && (
          <div className="mt-6 pt-6 space-y-3">
            <Link
              href="/default/en"
              className="block w-full bg-blue-600 text-white px-4 py-3 hover:bg-blue-700 font-medium transition-colors text-center"
            >
              {dict?.common?.goToDefaultStore || 'Go to Default Store'}
            </Link>
            <Link
              href="/signup"
              className="block w-full bg-gray-100 text-gray-700 px-4 py-3 hover:bg-gray-200 font-medium transition-colors text-center"
            >
              {dict?.common?.createNewStore || 'Create a New Store'}
            </Link>
          </div>
        )}

        {!loading && tenants.length === 0 && (
          <div className="mt-6 pt-6">
            <Link
              href="/signup"
              className="block w-full bg-blue-600 text-white px-4 py-3 hover:bg-blue-700 font-medium transition-colors text-center"
            >
              {dict?.common?.createYourFirstStore || 'Create Your First Store'}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

