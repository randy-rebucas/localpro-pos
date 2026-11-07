'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Search, SlidersHorizontal, X } from 'lucide-react';
import { EMPTY_TRANSACTION_FILTERS, type CatalogView, type TransactionFilterValues } from '@/hooks/useTransactionsCatalog';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

interface FilterOption {
  _id: string;
  name: string;
}

export interface TransactionFilterLabels {
  search: string;
  filters: string;
  clear: string;
  from: string;
  to: string;
  status: string;
  payment: string;
  cashier: string;
  branch: string;
  any: string;
  export: string;
  statuses: Record<'completed' | 'refunded' | 'cancelled', string>;
  payments: Record<'cash' | 'card' | 'digital' | 'on_account' | 'other', string>;
}

interface TransactionFiltersProps {
  view: CatalogView;
  values: TransactionFilterValues;
  onChange: (patch: Partial<TransactionFilterValues>) => void;
  cashiers: FilterOption[];
  branches: FilterOption[];
  labels: TransactionFilterLabels;
  /** Omitted for roles that can't export. */
  onExport?: (format: ExportFormat) => void;
  exporting: boolean;
}

const SEARCH_DEBOUNCE_MS = 300;
const LABEL = 'mb-1 block font-receipt text-xs font-medium uppercase tracking-[0.08em] text-white/60';
const FIELD = 'w-full min-h-[44px] border-2 border-transparent bg-paper-white px-3 py-2 font-receipt text-sm text-ink focus:border-[#8fe3d0] focus:outline-none';
const ICON = 'h-[18px] w-[18px]';

export default function TransactionFilters({ view, values, onChange, cashiers, branches, labels, onExport, exporting }: TransactionFiltersProps) {
  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState(values.search);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(debounce.current), []);

  const updateSearch = (text: string) => {
    setSearchText(text);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => onChange({ search: text.trim() }), text ? SEARCH_DEBOUNCE_MS : 0);
  };

  const clearAll = () => {
    clearTimeout(debounce.current);
    setSearchText('');
    onChange(EMPTY_TRANSACTION_FILTERS);
  };

  // Expenses have no status or branch
  const salesView = view !== 'expenses';
  const panelFilters = (['startDate', 'endDate', 'status', 'paymentMethod', 'userId', 'branchId'] as const)
    .filter((key) => values[key]).length;
  const anyActive = panelFilters > 0 || !!values.search;

  const select = (key: 'status' | 'paymentMethod' | 'userId' | 'branchId', label: string, options: { value: string; label: string }[]) => (
    <div>
      <label htmlFor={`tx-filter-${key}`} className={LABEL}>{label}</label>
      <select id={`tx-filter-${key}`} value={values[key]} onChange={(e) => onChange({ [key]: e.target.value })} className={FIELD}>
        <option value="">{labels.any}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );

  return (
    <div className="mb-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <input
            type="text"
            value={searchText}
            onChange={(e) => updateSearch(e.target.value)}
            placeholder={labels.search}
            aria-label={labels.search}
            className="w-full border-2 border-transparent bg-paper-white py-2.5 pl-11 pr-4 font-receipt text-base text-ink placeholder:text-ink/50 focus:border-[#8fe3d0] focus:outline-none"
          />
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink/50" strokeWidth={1.75} aria-hidden />
        </div>
        <div className="flex shrink-0 flex-wrap items-stretch gap-3">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="tx-filter-panel"
            className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 border px-4 font-receipt text-xs font-medium uppercase transition-colors touch-manipulation sm:flex-none ${open ? 'border-paper-white bg-paper-white text-ink' : 'border-white/25 text-paper hover:bg-white/10'}`}
          >
            <SlidersHorizontal className={ICON} strokeWidth={1.75} aria-hidden />
            {labels.filters}{panelFilters > 0 && ` (${panelFilters})`}
          </button>
          {onExport && (
            <div role="group" aria-label={labels.export} className="flex flex-1 divide-x divide-white/25 border border-white/25 sm:flex-none">
              <span className="flex items-center px-3 text-white/60" title={labels.export}>
                <Download className={ICON} strokeWidth={1.75} aria-hidden />
              </span>
              {(['csv', 'xlsx', 'pdf'] as const).map((format) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => onExport(format)}
                  disabled={exporting}
                  aria-label={`${labels.export} ${format.toUpperCase()}`}
                  className="flex min-h-[44px] flex-1 items-center justify-center px-3 font-receipt text-xs font-medium uppercase text-paper transition-colors hover:bg-white/10 disabled:cursor-wait disabled:opacity-50 touch-manipulation sm:flex-none"
                >
                  {format}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {open && (
        <div id="tx-filter-panel" className="mt-3 grid grid-cols-2 gap-3 border border-white/10 bg-black/20 p-3 md:grid-cols-3 xl:grid-cols-6">
          <div>
            <label htmlFor="tx-filter-from" className={LABEL}>{labels.from}</label>
            <input id="tx-filter-from" type="date" value={values.startDate} max={values.endDate || undefined} onChange={(e) => onChange({ startDate: e.target.value })} className={FIELD} />
          </div>
          <div>
            <label htmlFor="tx-filter-to" className={LABEL}>{labels.to}</label>
            <input id="tx-filter-to" type="date" value={values.endDate} min={values.startDate || undefined} onChange={(e) => onChange({ endDate: e.target.value })} className={FIELD} />
          </div>
          {salesView && select('status', labels.status, (['completed', 'refunded', 'cancelled'] as const).map((value) => ({ value, label: labels.statuses[value] })))}
          {select('paymentMethod', labels.payment, (['cash', 'card', 'digital', 'on_account', 'other'] as const).map((value) => ({ value, label: labels.payments[value] })))}
          {cashiers.length > 0 && select('userId', labels.cashier, cashiers.map(({ _id, name }) => ({ value: _id, label: name })))}
          {salesView && branches.length > 0 && select('branchId', labels.branch, branches.map(({ _id, name }) => ({ value: _id, label: name })))}
        </div>
      )}

      {anyActive && (
        <button
          type="button"
          onClick={clearAll}
          className="mt-2 flex min-h-[44px] items-center gap-2 font-receipt text-xs font-medium uppercase text-[#8fe3d0] transition-colors hover:text-paper-white"
        >
          <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {labels.clear}
        </button>
      )}
    </div>
  );
}
