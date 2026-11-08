'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { getDictionaryClient } from '../../dictionaries-client';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { LineTag } from '@/components/marketing/primitives';
import { ICON, RegisterPage } from '@/components/admin/register-ui';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';

type Dict = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
interface Endpoint { method: Method; path: string; description: string }

/** Reads print in ink, writes in teal, removals in stamp red. */
const METHOD_CLASS: Record<Method, string> = {
  GET: 'border-ink/30 text-ink',
  POST: 'border-brand-hover/60 text-brand-hover',
  PUT: 'border-brand-hover/60 text-brand-hover',
  PATCH: 'border-brand-hover/60 text-brand-hover',
  DELETE: 'border-stamp/60 text-stamp',
};

const CODE = 'overflow-x-auto border border-dashed border-ink/30 bg-paper p-3 font-receipt text-xs leading-relaxed text-ink sm:text-sm';

/** One price-list style section of the spec sheet. */
function SpecSection({ no, title, children }: { no: string; title: string; children: ReactNode }) {
  return (
    <section className="border-t border-dashed border-ink/30 px-4 py-6 first:border-t-0 sm:px-6">
      <LineTag no={no} className="mb-2 text-brand-hover">{title}</LineTag>
      {children}
    </section>
  );
}

export default function ApiDocsPage() {
  const params = useParams();
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<Dict>(null);
  const [origin, setOrigin] = useState('');
  const { settings } = useTenantSettings();

  useEffect(() => {
    getDictionaryClient(lang).then((loaded) => {
      setDict(loaded);
      setOrigin(window.location.origin);
    });
  }, [lang]);

  if (!dict) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  const d = dict.apiDocs || {};

  // Only routes that exist under app/api, with the methods they answer.
  const groups: { title: string; endpoints: Endpoint[] }[] = [
    {
      title: d.categorySession || 'Session',
      endpoints: [
        { method: 'POST', path: '/api/auth/login', description: d.descLogin || 'Sign in with email, password and store slug; sets the auth-token cookie' },
        { method: 'GET', path: '/api/auth/me', description: d.descMe || 'The signed-in user, role and store' },
        { method: 'POST', path: '/api/auth/logout', description: d.descLogout || 'Sign out and revoke the token' },
      ],
    },
    {
      title: d.categoryProducts || 'Products',
      endpoints: [
        { method: 'GET', path: '/api/products', description: d.descProductsList || 'List all products' },
        { method: 'POST', path: '/api/products', description: d.descProductsCreate || 'Create a new product' },
        { method: 'GET', path: '/api/products/:id', description: d.descProductsGet || 'Get product details' },
        { method: 'PUT', path: '/api/products/:id', description: d.descProductsUpdate || 'Update a product' },
        { method: 'PATCH', path: '/api/products/:id', description: d.descProductsPatch || 'Change some fields of a product' },
        { method: 'DELETE', path: '/api/products/:id', description: d.descProductsDeactivate || 'Deactivate a product (it stays on past receipts)' },
        { method: 'GET', path: '/api/products/by-barcode?code=', description: d.descProductsByBarcode || 'Find a product by its barcode' },
        { method: 'POST', path: '/api/products/:id/refill', description: d.descProductsRefill || 'Add stock to a product' },
      ],
    },
    {
      title: d.categoryCategories || 'Categories',
      endpoints: [
        { method: 'GET', path: '/api/categories', description: d.descCategoriesList || 'List categories' },
        { method: 'POST', path: '/api/categories', description: d.descCategoriesCreate || 'Create a category' },
        { method: 'GET', path: '/api/categories/:id', description: d.descCategoriesGet || 'Get a category' },
        { method: 'PUT', path: '/api/categories/:id', description: d.descCategoriesUpdate || 'Update a category' },
        { method: 'DELETE', path: '/api/categories/:id', description: d.descCategoriesDelete || 'Delete a category' },
      ],
    },
    {
      title: d.categoryTransactions || 'Transactions',
      endpoints: [
        { method: 'GET', path: '/api/transactions', description: d.descTransactionsList || 'List all transactions' },
        { method: 'POST', path: '/api/transactions', description: d.descTransactionsCreate || 'Create a new transaction' },
        { method: 'GET', path: '/api/transactions/:id', description: d.descTransactionsGet || 'Get transaction details' },
        { method: 'PUT', path: '/api/transactions/:id', description: d.descTransactionsStatus || 'Change a sale’s status, such as a void' },
        { method: 'POST', path: '/api/transactions/:id/refund', description: d.descTransactionsRefund || 'Refund all or part of a sale' },
      ],
    },
    {
      title: d.categoryCustomers || 'Customers',
      endpoints: [
        { method: 'GET', path: '/api/customers', description: d.descCustomersList || 'List all customers' },
        { method: 'POST', path: '/api/customers', description: d.descCustomersCreate || 'Create a new customer' },
        { method: 'GET', path: '/api/customers/:id', description: d.descCustomersGet || 'Get customer details' },
        { method: 'PATCH', path: '/api/customers/:id', description: d.descCustomersUpdate || 'Update a customer' },
        { method: 'DELETE', path: '/api/customers/:id', description: d.descCustomersDeactivate || 'Deactivate a customer' },
      ],
    },
    {
      title: d.categoryInventory || 'Inventory',
      endpoints: [
        { method: 'GET', path: '/api/inventory/low-stock', description: d.descInventoryLowStock || 'Products at or below their low-stock level' },
        { method: 'GET', path: '/api/inventory/realtime', description: d.descInventoryRealtime || 'Live stock changes as a server-sent event stream' },
        { method: 'GET', path: '/api/stock-movements', description: d.descInventoryMovements || 'Get stock movements' },
      ],
    },
  ];

  const base = `${origin || ''}/api`;
  let line = 0;

  return (
    <RegisterPage
      tagNo="API"
      tag={settings?.companyName}
      title={d.title || 'API Documentation'}
      subtitle={d.subtitleShort || 'The endpoints behind this register, for your own scripts and integrations.'}
    >
      <div className="mt-8 max-w-4xl">
        <div className="mk-tear-t h-3 bg-paper-white" aria-hidden />
        <div className="bg-paper-white text-ink">

          <SpecSection no="01" title={d.authSection || 'Authentication'}>
            <p className="max-w-prose text-sm text-ink/80">
              {d.authIntro || 'There are no separate API keys. Every call runs as a signed-in user: signing in sets an httpOnly auth-token cookie, and each request only sees this store’s data, within that user’s role and permissions.'}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 font-receipt text-xs font-medium uppercase tracking-[0.08em] text-ink/60">{d.authCookie || 'Cookie'}</p>
                <pre className={CODE}><code>Cookie: auth-token={'<JWT>'}</code></pre>
              </div>
              <div>
                <p className="mb-1 font-receipt text-xs font-medium uppercase tracking-[0.08em] text-ink/60">{d.authHeader || 'Authorization Header'}</p>
                <pre className={CODE}><code>Authorization: Bearer {'<JWT>'}</code></pre>
              </div>
            </div>
            <p className="mt-3 font-receipt text-xs text-ink/60">
              {d.authNote || 'Sign-in is protected by a bot check, so scripts work best with the session of a browser that is already signed in.'}
            </p>
          </SpecSection>

          <SpecSection no="02" title={d.baseUrlSection || 'Base URL'}>
            <pre className={CODE}><code>{base}</code></pre>
            <p className="mt-3 text-sm text-ink/80">
              {d.baseUrlDescStore || 'The store comes from the signed-in user, so the address is the same for every store on this site.'}
            </p>
          </SpecSection>

          <SpecSection no="03" title={d.endpointsSection || 'API Endpoints'}>
            <div className="space-y-6">
              {groups.map((group) => (
                <div key={group.title}>
                  <h2 className="border-b border-ink/30 pb-1 text-3xl">{group.title}</h2>
                  <ul className="divide-y divide-dashed divide-ink/20">
                    {group.endpoints.map((endpoint) => {
                      line += 1;
                      return (
                        <li key={`${endpoint.method} ${endpoint.path}`} className="grid grid-cols-[2.25rem_4.5rem_1fr] items-baseline gap-x-2 py-2.5 sm:grid-cols-[2.5rem_5rem_minmax(0,22rem)_1fr] sm:gap-x-3">
                          <span className="font-receipt text-xs text-ink/40">{String(line).padStart(3, '0')}</span>
                          <span className={`justify-self-start border px-1.5 py-0.5 font-receipt text-[11px] font-semibold ${METHOD_CLASS[endpoint.method]}`}>
                            {endpoint.method}
                          </span>
                          <code className="min-w-0 break-all font-receipt text-sm text-ink">{endpoint.path}</code>
                          <p className="col-start-3 mt-0.5 text-sm text-ink/70 sm:col-start-auto sm:mt-0">{endpoint.description}</p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </SpecSection>

          <SpecSection no="04" title={d.responseFormatSection || 'Response Format'}>
            <p className="max-w-prose text-sm text-ink/80">
              {d.responseFormatDesc || 'All API responses follow a standard JSON format with success status and data or error information.'}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <pre className={CODE}>{`{
  "success": true,
  "data": { … }
}`}</pre>
              <pre className={CODE}>{`{
  "success": false,
  "error": "…"
}`}</pre>
            </div>
            <dl className="mt-4 space-y-1 font-receipt text-sm">
              {[
                ['401', d.status401 || 'Not signed in, or the session has ended'],
                ['403', d.status403 || 'The user’s role does not allow this'],
                ['404', d.status404 || 'Not found in this store'],
                ['429', d.status429 || 'Too many requests; wait and try again'],
              ].map(([code, text]) => (
                <div key={code} className="flex gap-3">
                  <dt className="w-10 shrink-0 font-semibold">{code}</dt>
                  <dd className="text-ink/70">{text}</dd>
                </div>
              ))}
            </dl>
          </SpecSection>

          <SpecSection no="05" title={d.additionalResources || 'Additional Resources'}>
            <a
              href="/openapi.json"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center gap-2 font-receipt text-sm font-medium uppercase tracking-[0.08em] text-brand-hover underline-offset-4 hover:underline"
            >
              {d.openApiSchema || 'OpenAPI Schema'}
              <ExternalLink className={ICON} strokeWidth={1.75} aria-hidden />
            </a>
            <p className="font-receipt text-xs text-ink/60">
              {d.openApiNote || 'Covers sign-in, products, transactions, subscriptions and health so far.'}
            </p>
          </SpecSection>
        </div>
        <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
      </div>
    </RegisterPage>
  );
}
