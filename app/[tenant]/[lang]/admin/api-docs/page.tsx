'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import AdminPageHeader from '@/components/admin/AdminPageHeader';

const METHOD_BADGE: Record<string, string> = {
  GET: 'bg-brand text-white',
  POST: 'bg-win8-success text-white',
  PUT: 'bg-win8-warning text-white',
  PATCH: 'bg-win8-accent text-white',
  DELETE: 'bg-win8-danger text-white',
};

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const CODE_BLOCK = 'bg-gray-100 border border-gray-300 p-3 font-mono text-xs text-gray-800 overflow-x-auto';

const EXTERNAL_ICON = 'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14';

interface Endpoint {
  method: string;
  path: string;
  description: string;
}

export default function ApiDocsPage() {
  const params = useParams();
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('');

  useEffect(() => {
    getDictionaryClient(lang).then((d) => {
      setDict(d);
      setLoading(false);
    });
  }, [lang]);

  if (!dict || loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
        <p className="mt-3 text-sm text-gray-400">{dict?.common?.loading || 'Loading…'}</p>
      </div>
    );
  }

  const apiEndpoints: { category: string; endpoints: Endpoint[] }[] = [
    {
      category: dict?.apiDocs?.categoryProducts || 'Products',
      endpoints: [
        { method: 'GET', path: '/api/products', description: dict?.apiDocs?.descProductsList || 'List all products' },
        { method: 'POST', path: '/api/products', description: dict?.apiDocs?.descProductsCreate || 'Create a new product' },
        { method: 'GET', path: '/api/products/:id', description: dict?.apiDocs?.descProductsGet || 'Get product details' },
        { method: 'PUT', path: '/api/products/:id', description: dict?.apiDocs?.descProductsUpdate || 'Update a product' },
        { method: 'PATCH', path: '/api/products/:id', description: dict?.apiDocs?.descProductsPatch || 'Update selected fields of a product' },
        { method: 'DELETE', path: '/api/products/:id', description: dict?.apiDocs?.descProductsDelete || 'Delete a product' },
      ],
    },
    {
      category: dict?.apiDocs?.categoryTransactions || 'Transactions',
      endpoints: [
        { method: 'GET', path: '/api/transactions', description: dict?.apiDocs?.descTransactionsList || 'List all transactions' },
        { method: 'POST', path: '/api/transactions', description: dict?.apiDocs?.descTransactionsCreate || 'Create a new transaction' },
        { method: 'GET', path: '/api/transactions/:id', description: dict?.apiDocs?.descTransactionsGet || 'Get transaction details' },
        { method: 'PUT', path: '/api/transactions/:id', description: dict?.apiDocs?.descTransactionsVoid || 'Void a completed transaction (refunds use the dedicated refund endpoint)' },
      ],
    },
    {
      category: dict?.apiDocs?.categoryCustomers || 'Customers',
      endpoints: [
        { method: 'GET', path: '/api/customers', description: dict?.apiDocs?.descCustomersList || 'List all customers' },
        { method: 'POST', path: '/api/customers', description: dict?.apiDocs?.descCustomersCreate || 'Create a new customer' },
        { method: 'GET', path: '/api/customers/:id', description: dict?.apiDocs?.descCustomersGet || 'Get customer details' },
        { method: 'PATCH', path: '/api/customers/:id', description: dict?.apiDocs?.descCustomersUpdate || 'Update a customer' },
        { method: 'DELETE', path: '/api/customers/:id', description: dict?.apiDocs?.descCustomersDelete || 'Delete a customer' },
      ],
    },
    {
      category: dict?.apiDocs?.categoryInventory || 'Inventory',
      endpoints: [
        { method: 'GET', path: '/api/inventory/low-stock', description: dict?.apiDocs?.descInventoryLowStock || 'List products at or below their low-stock threshold' },
        { method: 'GET', path: '/api/inventory/realtime', description: dict?.apiDocs?.descInventoryRealtime || 'Subscribe to live stock updates (Server-Sent Events)' },
        { method: 'GET', path: '/api/stock-movements', description: dict?.apiDocs?.descStockMovements || 'List stock movements' },
        { method: 'POST', path: '/api/products/bulk-restock', description: dict?.apiDocs?.descBulkRestock || 'Restock several products at once' },
      ],
    },
  ];

  const query = search.trim().toLowerCase();
  const filtered = apiEndpoints
    .map((group) => ({
      ...group,
      endpoints: group.endpoints.filter((e) =>
        (!methodFilter || e.method === methodFilter) &&
        (!query || e.path.toLowerCase().includes(query) || e.description.toLowerCase().includes(query))
      ),
    }))
    .filter((group) => group.endpoints.length > 0);
  const totalEndpoints = apiEndpoints.reduce((n, g) => n + g.endpoints.length, 0);
  const shownEndpoints = filtered.reduce((n, g) => n + g.endpoints.length, 0);
  const hasFilters = !!query || !!methodFilter;
  // Content only renders after the client-side dictionary load, so window is
  // always defined here (the server render shows the spinner).
  const baseUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/api`;

  const resources = [
    { href: '/openapi.json', title: dict?.apiDocs?.openApiSchema || 'OpenAPI Schema', desc: dict?.apiDocs?.openApiSchemaDesc || 'Machine-readable schema for code generators and API clients' },
    { href: '/README.md', title: dict?.apiDocs?.projectDocs || 'Project Documentation', desc: dict?.apiDocs?.projectDocsDesc || 'Setup, architecture and feature overview' },
  ];

  return (
    <div className="px-4 sm:px-6 py-6">
      <AdminPageHeader
        title={dict?.apiDocs?.title || 'API Documentation'}
        description={dict?.apiDocs?.subtitle || 'Comprehensive API endpoints and integration guides for 1POS. All API endpoints require authentication via JWT token in the Authorization header or auth-token cookie.'}
      />

      <div className="space-y-6">
        {/* Base URL + Authentication */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-white border border-gray-300">
            <div className="px-6 py-4 border-b border-gray-300">
              <h2 className="text-base font-bold text-gray-900">{dict?.apiDocs?.baseUrlSection || 'Base URL'}</h2>
              <p className="text-sm text-gray-500">
                {dict?.apiDocs?.baseUrlDesc || "All endpoints are relative to this URL. Requests are scoped to the store of the authenticated user's token."}
              </p>
            </div>
            <div className="p-6">
              <div className={CODE_BLOCK}><code>{baseUrl}</code></div>
            </div>
          </section>

          <section className="bg-white border border-gray-300">
            <div className="px-6 py-4 border-b border-gray-300">
              <h2 className="text-base font-bold text-gray-900">{dict?.apiDocs?.authSection || 'Authentication'}</h2>
              <p className="text-sm text-gray-500">{dict?.apiDocs?.authDesc || 'Send the JWT using either method.'}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{dict?.apiDocs?.authHeader || 'Authorization Header'}</p>
                <div className={CODE_BLOCK}><code>Authorization: Bearer {'<JWT_TOKEN>'}</code></div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{dict?.apiDocs?.authCookie || 'Cookie'}</p>
                <div className={CODE_BLOCK}><code>auth-token={'<JWT_TOKEN>'}</code></div>
              </div>
            </div>
          </section>
        </div>

        {/* Endpoints */}
        <section className="bg-white border border-gray-300">
          <div className="px-6 py-4 border-b border-gray-300 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-bold text-gray-900">{dict?.apiDocs?.endpointsSection || 'API Endpoints'}</h2>
              <p className="text-sm text-gray-500 tabular-nums">
                {(dict?.apiDocs?.endpointsShown || '{shown} of {total} endpoints')
                  .replace('{shown}', String(shownEndpoints))
                  .replace('{total}', String(totalEndpoints))}
              </p>
            </div>
            <div className="flex gap-3 flex-wrap">
              <div className="relative">
                <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={dict?.apiDocs?.searchEndpoints || 'Search path or description…'}
                  aria-label={dict?.apiDocs?.searchEndpoints || 'Search path or description…'}
                  className="pl-8 pr-3 py-2 border border-gray-300 text-sm w-56"
                />
              </div>
              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
                aria-label={dict?.apiDocs?.filterByMethod || 'Filter by method'}
                className="px-3 py-2 border border-gray-300 text-sm bg-white text-gray-900"
              >
                <option value="">{dict?.apiDocs?.allMethods || 'All methods'}</option>
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              {dict?.apiDocs?.noEndpointsMatch || 'No endpoints match your filters.'}
              {hasFilters && (
                <div>
                  <button
                    onClick={() => { setSearch(''); setMethodFilter(''); }}
                    className="mt-3 px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
                  >
                    {dict?.common?.clearFilters || 'Clear Filters'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium w-24">{dict?.apiDocs?.columnMethod || 'Method'}</th>
                    <th className="px-4 py-3 text-left font-medium">{dict?.apiDocs?.columnPath || 'Path'}</th>
                    <th className="px-4 py-3 text-left font-medium">{dict?.apiDocs?.columnDescription || 'Description'}</th>
                  </tr>
                </thead>
                {filtered.map((group) => (
                  <tbody key={group.category} className="divide-y divide-gray-200 border-b border-gray-300 last:border-b-0">
                    <tr className="bg-gray-100">
                      <th colSpan={3} scope="colgroup" className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        {group.category}
                      </th>
                    </tr>
                    {group.endpoints.map((endpoint) => (
                      <tr key={`${endpoint.method} ${endpoint.path}`} className="hover:bg-gray-100 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-block w-16 text-center px-2 py-0.5 text-xs font-semibold font-mono ${METHOD_BADGE[endpoint.method] || 'bg-gray-500 text-white'}`}>
                            {endpoint.method}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-900 break-all">{endpoint.path}</td>
                        <td className="px-4 py-3 text-gray-600">{endpoint.description}</td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          )}
        </section>

        {/* Response format */}
        <section className="bg-white border border-gray-300">
          <div className="px-6 py-4 border-b border-gray-300">
            <h2 className="text-base font-bold text-gray-900">{dict?.apiDocs?.responseFormatSection || 'Response Format'}</h2>
            <p className="text-sm text-gray-500">
              {dict?.apiDocs?.responseFormatDesc || 'All API responses follow a standard JSON format with success status and data or error information.'}
            </p>
          </div>
          <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{dict?.apiDocs?.successResponse || 'Success'}</p>
              <pre className={CODE_BLOCK}>{`{
  "success": true,
  "data": { /* response data */ }
}`}</pre>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{dict?.apiDocs?.errorResponse || 'Error'}</p>
              <pre className={CODE_BLOCK}>{`{
  "success": false,
  "error": "Error message"
}`}</pre>
            </div>
          </div>
        </section>

        {/* Additional resources */}
        <section className="bg-white border border-gray-300">
          <div className="px-6 py-4 border-b border-gray-300">
            <h2 className="text-base font-bold text-gray-900">{dict?.apiDocs?.additionalResources || 'Additional Resources'}</h2>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {resources.map((r) => (
              <a
                key={r.href}
                href={r.href}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white border border-gray-300 p-5 hover:border-brand transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <span className="w-9 h-9 shrink-0 bg-brand text-white flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d={EXTERNAL_ICON} />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 group-hover:text-brand">{r.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-snug">{r.desc}</p>
                    <p className="text-xs text-gray-400 font-mono mt-1">{r.href}</p>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
