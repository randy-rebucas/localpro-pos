'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';
import Currency from '@/components/Currency';
import type { CustomerSummary } from '@/types/customer';

interface RecentTransaction {
  _id: string;
  receiptNumber?: string;
  total: number;
  createdAt: string;
  paymentMethod?: string;
}

interface CustomerSidePanelProps {
  tenant: string;
  selectedCustomer: CustomerSummary | null;
  onSelectCustomer: (customer: CustomerSummary | null) => void;
}

export default function CustomerSidePanel({ tenant, selectedCustomer, onSelectCustomer }: CustomerSidePanelProps) {
  const params = useParams();
  const lang = (params?.lang as 'en' | 'es') || 'en';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<CustomerSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [recentTxns, setRecentTxns] = useState<RecentTransaction[]>([]);
  const [loadingTxns, setLoadingTxns] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const d = dict?.components?.customerSidePanel;

  const searchCustomers = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setShowDropdown(false); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(q)}&tenant=${tenant}&limit=8`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setResults(data.data);
        setShowDropdown(true);
      }
    } catch {
      // ignore
    } finally {
      setSearching(false);
    }
  }, [tenant]);

  const loadTransactions = useCallback(async (customerId: string) => {
    setLoadingTxns(true);
    try {
      const res = await fetch(`/api/transactions?customerId=${customerId}&tenant=${tenant}&limit=5`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) setRecentTxns(data.data);
    } catch {
      // ignore
    } finally {
      setLoadingTxns(false);
    }
  }, [tenant]);

  const handleSelect = (customer: CustomerSummary) => {
    onSelectCustomer(customer);
    setSearch('');
    setShowDropdown(false);
    setResults([]);
    loadTransactions(customer._id);
  };

  const handleClear = () => {
    onSelectCustomer(null);
    setRecentTxns([]);
    setSearch('');
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchCustomers(search), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, searchCustomers]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="border-b border-dashed border-ink/30 pt-1 pb-3">
      {!selectedCustomer ? (
        <div ref={wrapperRef} className="relative">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-ink/50 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="font-receipt text-xs font-medium text-ink/70 uppercase tracking-wide">{d?.customer || 'Customer'}</span>
          </div>
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={d?.searchPlaceholder || 'Search by name, email, or phone…'}
              className="w-full border border-ink/25 px-3 py-2 font-receipt text-sm focus:outline-none focus:border-ink bg-paper-white"
            />
            {searching && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <svg className="w-4 h-4 animate-spin text-ink/50" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              </div>
            )}
          </div>

          {showDropdown && results.length > 0 && (
            <div className="absolute z-30 left-0 right-0 top-full mt-0.5 bg-paper-white border-2 border-ink max-h-52 overflow-y-auto">
              {results.map((c) => (
                <button
                  key={c._id}
                  type="button"
                  onClick={() => handleSelect(c)}
                  className="w-full text-left px-3 py-2.5 hover:bg-paper border-b border-dashed border-ink/25 last:border-0 transition-colors"
                >
                  <div className="font-semibold text-sm text-ink">{c.firstName} {c.lastName}</div>
                  <div className="text-xs text-ink/60">{c.phone || c.email || '—'}</div>
                </button>
              ))}
            </div>
          )}

          {showDropdown && results.length === 0 && !searching && search.trim() && (
            <div className="absolute z-30 left-0 right-0 top-full mt-0.5 bg-paper-white border-2 border-ink px-3 py-2 text-sm text-ink/60">
              {d?.noCustomersFound || 'No customers found'}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 bg-ink flex items-center justify-center flex-shrink-0">
                <span className="font-receipt text-paper-white font-semibold text-xs">
                  {selectedCustomer.firstName[0]}{selectedCustomer.lastName[0]}
                </span>
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-sm text-ink truncate">{selectedCustomer.firstName} {selectedCustomer.lastName}</div>
                <div className="text-xs text-ink/60 truncate">{selectedCustomer.phone || selectedCustomer.email || '—'}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-ink/50 hover:text-ink flex-shrink-0"
              title={d?.removeCustomer || 'Remove customer'}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Loyalty points */}
          {selectedCustomer.loyaltyPointsBalance !== undefined && (
            <div className="mt-2 flex items-center gap-1.5 font-receipt text-xs text-ink bg-brand-soft px-2 py-1">
              <svg className="w-3.5 h-3.5 text-brand-hover" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="font-semibold">{selectedCustomer.loyaltyPointsBalance.toLocaleString()}</span>
              <span>{d?.points || 'points'}</span>
            </div>
          )}

          {(Number(selectedCustomer.accountBalance) > 0 || selectedCustomer.creditLimit != null) && (
            <div className="mt-2 space-y-1 font-receipt text-xs border-y border-dashed border-ink/30 py-1.5">
              {Number(selectedCustomer.accountBalance) > 0 && (
                <div className="flex justify-between gap-2 text-ink/80">
                  <span className="text-ink/60">{d?.balanceDue || 'Balance due'}</span>
                  <span className="font-semibold"><Currency amount={Number(selectedCustomer.accountBalance)} /></span>
                </div>
              )}
              {selectedCustomer.creditLimit != null && !Number.isNaN(Number(selectedCustomer.creditLimit)) && (
                <div className="flex justify-between gap-2 text-ink/70">
                  <span className="text-ink/60">{d?.creditLimit || 'Credit limit'}</span>
                  <span className="font-medium"><Currency amount={Number(selectedCustomer.creditLimit)} /></span>
                </div>
              )}
            </div>
          )}

          {/* Recent transactions */}
          <div className="mt-2">
            <p className="font-receipt text-[10px] font-medium text-ink/60 uppercase tracking-wide mb-1">{d?.recentPurchases || 'Recent purchases'}</p>
            {loadingTxns ? (
              <div className="text-xs text-ink/50 py-1">{d?.loading || 'Loading…'}</div>
            ) : recentTxns.length === 0 ? (
              <div className="text-xs text-ink/50 py-1">{d?.noPurchasesYet || 'No purchases yet'}</div>
            ) : (
              <div className="space-y-1">
                {recentTxns.map((t) => (
                  <div key={t._id} className="flex justify-between items-center font-receipt text-xs text-ink/70">
                    <span className="text-ink/60">{new Date(t.createdAt).toLocaleDateString()}</span>
                    <span className="font-semibold"><Currency amount={t.total} /></span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
