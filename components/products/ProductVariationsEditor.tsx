'use client';

import { Plus, X } from 'lucide-react';

export interface VariationFormRow {
  /** Stable key for React, since new rows have no _id yet. */
  key: string;
  _id?: string;
  size: string;
  color: string;
  type: string;
  sku: string;
  price: string;
  stock: string;
}

export interface VariationEditorLabels {
  title: string;
  hint: string;
  add: string;
  remove: string;
  size: string;
  color: string;
  type: string;
  sku: string;
  price: string;
  priceHint: string;
  stock: string;
  stockHint: string;
  stockNote: string;
}

interface ProductVariationsEditorProps {
  rows: VariationFormRow[];
  onChange: (rows: VariationFormRow[]) => void;
  labels: VariationEditorLabels;
  error?: string;
}

const FIELD = 'w-full border border-gray-300 bg-white px-2.5 py-2 text-sm';
const LABEL = 'mb-1 block text-xs font-medium text-gray-600';

let nextKey = 0;
export const newVariationRow = (): VariationFormRow => ({
  key: `new-${++nextKey}`,
  size: '',
  color: '',
  type: '',
  sku: '',
  price: '',
  stock: '',
});

/** Existing variations show their stock read-only: it changes through Refill and sales, never here. */
export default function ProductVariationsEditor({ rows, onChange, labels, error }: ProductVariationsEditorProps) {
  const update = (key: string, patch: Partial<VariationFormRow>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const input = (row: VariationFormRow, field: 'size' | 'color' | 'type' | 'sku', label: string, maxLength: number) => (
    <div className="min-w-0">
      <label htmlFor={`${row.key}-${field}`} className={LABEL}>{label}</label>
      <input
        id={`${row.key}-${field}`}
        type="text"
        maxLength={maxLength}
        value={row[field]}
        onChange={(e) => update(row.key, { [field]: e.target.value })}
        className={FIELD}
      />
    </div>
  );

  return (
    <div className="border-t border-gray-200 pt-4">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-700">{labels.title}</h3>
        <button
          type="button"
          onClick={() => onChange([...rows, newVariationRow()])}
          className="flex min-h-[44px] items-center gap-1 text-sm font-medium text-brand-hover hover:text-ink"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {labels.add}
        </button>
      </div>
      <p className="mb-3 text-xs text-gray-500">{labels.hint}</p>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.key} className="border border-gray-300 p-3">
            <div className="grid grid-cols-3 gap-2">
              {input(row, 'size', labels.size, 100)}
              {input(row, 'color', labels.color, 100)}
              {input(row, 'type', labels.type, 100)}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {input(row, 'sku', labels.sku, 50)}
              <div className="min-w-0">
                <label htmlFor={`${row.key}-price`} className={LABEL}>{labels.price}</label>
                <input
                  id={`${row.key}-price`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.price}
                  placeholder={labels.priceHint}
                  onChange={(e) => update(row.key, { price: e.target.value })}
                  className={FIELD}
                />
              </div>
              <div className="min-w-0">
                <label htmlFor={`${row.key}-stock`} className={LABEL}>{labels.stock}</label>
                {row._id ? (
                  <p id={`${row.key}-stock`} className="px-2.5 py-2 text-sm text-gray-900">{row.stock || 0}</p>
                ) : (
                  <input
                    id={`${row.key}-stock`}
                    type="number"
                    min="0"
                    step="1"
                    value={row.stock}
                    placeholder="0"
                    onChange={(e) => update(row.key, { stock: e.target.value })}
                    className={FIELD}
                  />
                )}
              </div>
            </div>
            <div className="mt-1 flex justify-end">
              <button
                type="button"
                onClick={() => onChange(rows.filter((item) => item.key !== row.key))}
                className="flex min-h-[44px] items-center gap-1 text-sm text-gray-500 hover:text-stamp"
              >
                <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                {labels.remove}
              </button>
            </div>
          </div>
        ))}
      </div>

      {rows.length > 0 && <p className="mt-2 text-xs text-gray-500">{labels.stockNote}</p>}
      {rows.some((row) => !row._id) && <p className="mt-1 text-xs text-gray-500">{labels.stockHint}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
