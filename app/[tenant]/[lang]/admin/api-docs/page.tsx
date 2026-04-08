'use client';

import React, { useEffect, useState } from 'react';
import AdminNavBar from '@/components/AdminNavBar';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';

export default function ApiDocsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [loading, setLoading] = useState(true);
  const { settings } = useTenantSettings();
  const tenantSettings = settings || getDefaultTenantSettings();
  const primaryColor = tenantSettings.primaryColor || '#3b82f6';

  useEffect(() => {
    getDictionaryClient(lang).then((d) => {
      setDict(d);
      setLoading(false);
    });
  }, [lang]);

  if (!dict || loading) {
    return (
      <div className="bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div
            className="inline-block animate-spin h-8 w-8 border-b-2"
            style={{ borderColor: primaryColor, borderBottomColor: 'transparent' }}
          ></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  const apiEndpoints = [
    {
      category: 'Products',
      endpoints: [
        { method: 'GET', path: '/api/products', description: 'List all products' },
        { method: 'POST', path: '/api/products', description: 'Create a new product' },
        { method: 'GET', path: '/api/products/:id', description: 'Get product details' },
        { method: 'PUT', path: '/api/products/:id', description: 'Update a product' },
        { method: 'DELETE', path: '/api/products/:id', description: 'Delete a product' },
      ],
    },
    {
      category: 'Transactions',
      endpoints: [
        { method: 'GET', path: '/api/transactions', description: 'List all transactions' },
        { method: 'POST', path: '/api/transactions', description: 'Create a new transaction' },
        { method: 'GET', path: '/api/transactions/:id', description: 'Get transaction details' },
      ],
    },
    {
      category: 'Customers',
      endpoints: [
        { method: 'GET', path: '/api/customers', description: 'List all customers' },
        { method: 'POST', path: '/api/customers', description: 'Create a new customer' },
        { method: 'GET', path: '/api/customers/:id', description: 'Get customer details' },
        { method: 'PUT', path: '/api/customers/:id', description: 'Update a customer' },
        { method: 'DELETE', path: '/api/customers/:id', description: 'Delete a customer' },
      ],
    },
    {
      category: 'Inventory',
      endpoints: [
        { method: 'GET', path: '/api/inventory/stock', description: 'Get stock levels' },
        { method: 'POST', path: '/api/inventory/adjust', description: 'Adjust stock levels' },
        { method: 'GET', path: '/api/inventory/movements', description: 'Get stock movements' },
      ],
    },
  ];

  const methodColors: Record<string, string> = {
    GET: 'bg-blue-100 text-blue-700',
    POST: 'bg-green-100 text-green-700',
    PUT: 'bg-yellow-100 text-yellow-700',
    DELETE: 'bg-red-100 text-red-700',
    PATCH: 'bg-purple-100 text-purple-700',
  };

  return (
    <div className="bg-gray-50">
      <AdminNavBar />
      <div className="px-6 py-5">
        <div className="mb-5">
          <h1 className="text-xl font-bold text-gray-900 mb-1">
            API Documentation
          </h1>
          <p className="text-gray-600">
            Comprehensive API endpoints and integration guides for 1POS. All API endpoints require authentication via JWT token in the Authorization header or auth-token cookie.
          </p>
        </div>

        <div className="space-y-8">
          {/* Authentication Section */}
          <div className="bg-white border border-gray-200 p-5">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Authentication</h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Authorization Header</h3>
                <div className="bg-gray-100 p-4 border border-gray-300 font-mono text-sm overflow-x-auto">
                  <code>Authorization: Bearer {'<JWT_TOKEN>'}</code>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Cookie</h3>
                <div className="bg-gray-100 p-4 border border-gray-300 font-mono text-sm">
                  <code>auth-token: {'<JWT_TOKEN>'}</code>
                </div>
              </div>
            </div>
          </div>

          {/* API Endpoints Section */}
          <div className="bg-white border border-gray-200 p-5">
            <h2 className="text-xl font-bold text-gray-900 mb-6">API Endpoints</h2>
            <div className="space-y-8">
              {apiEndpoints.map((category, idx) => (
                <div key={idx}>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-gray-300">
                    {category.category}
                  </h3>
                  <div className="space-y-3">
                    {category.endpoints.map((endpoint, endIdx) => (
                      <div
                        key={endIdx}
                        className="border border-gray-300 p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start gap-4 flex-wrap">
                          <span
                            className={`px-3 py-1 font-semibold text-sm whitespace-nowrap ${
                              methodColors[endpoint.method] || 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {endpoint.method}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="font-mono text-sm text-gray-900 break-all">
                              {endpoint.path}
                            </div>
                            <p className="text-sm text-gray-600 mt-1">{endpoint.description}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Response Format Section */}
          <div className="bg-white border border-gray-200 p-5">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Response Format</h2>
            <p className="text-gray-600 mb-4">
              All API responses follow a standard JSON format with success status and data or error information.
            </p>
            <div className="bg-gray-100 p-4 border border-gray-300 font-mono text-sm overflow-x-auto">
              <pre>{`{
  "success": true,
  "data": { /* response data */ }
}

// Error response:
{
  "success": false,
  "error": "Error message"
}`}</pre>
            </div>
          </div>

          {/* Base URL Section */}
          <div className="bg-white border border-gray-200 p-5">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Base URL</h2>
            <div className="bg-gray-100 p-4 border border-gray-300 font-mono text-sm">
              <code>https://your-instance.localpro.app/api</code>
            </div>
            <p className="text-gray-600 mt-4">
              Replace <code className="bg-gray-100 px-2 py-1">your-instance</code> with your actual tenant slug.
            </p>
          </div>

          {/* Additional Resources */}
          <div className="bg-white border border-gray-200 p-5">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Additional Resources</h2>
            <ul className="space-y-3">
              <li>
                <a
                  href="/openapi.json"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-2"
                >
                  <span>OpenAPI Schema</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </li>
              <li>
                <a
                  href="/README.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-2"
                >
                  <span>Project Documentation</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
