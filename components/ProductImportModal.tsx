'use client';

import React, { useRef, useState } from 'react';
import { showToast } from '@/lib/toast';
import { downloadCSV } from '@/lib/export';
import { getProductImportTemplateCSV } from '@/lib/product-import';

interface ImportPreviewRow {
  row: number;
  status: 'valid' | 'error';
  data?: { name: string; sku?: string; price: number; stock: number; category?: string };
  errors?: string[];
}

interface ProductImportModalProps {
  dict: Record<string, unknown>;
  onClose: () => void;
  onComplete: () => void;
}

export default function ProductImportModal({ dict, onClose, onComplete }: ProductImportModalProps) {
  const productsDict = (dict.products ?? {}) as Record<string, string>;
  const commonDict = (dict.common ?? {}) as Record<string, string>;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportPreviewRow[] | null>(null);
  const [summary, setSummary] = useState<{ total: number; valid: number; errors: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [importResult, setImportResult] = useState<{ created: number; failed: number } | null>(null);

  const handleDownloadTemplate = () => {
    downloadCSV(getProductImportTemplateCSV(), 'product-import-template.csv');
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      showToast.error(productsDict.importInvalidFile || 'Please select a CSV file');
      return;
    }

    setFileName(file.name);
    setLoading(true);
    setPreview(null);
    setSummary(null);
    setStep('upload');

    try {
      const text = await file.text();
      setCsvText(text);

      const res = await fetch('/api/products/import', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: text, confirm: false }),
      });
      const data = await res.json();

      if (!data.success) {
        const msg = data.error || data.errors?.join(', ') || productsDict.importError || 'Failed to validate import';
        showToast.error(msg);
        return;
      }

      setPreview(data.preview);
      setSummary(data.summary);
      setStep('preview');
    } catch {
      showToast.error(productsDict.importError || 'Failed to import products');
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (!csvText || !summary?.valid) return;

    setImporting(true);
    try {
      const res = await fetch('/api/products/import', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText, confirm: true }),
      });
      const data = await res.json();

      if (!data.success) {
        showToast.error(data.error || productsDict.importError || 'Failed to import products');
        if (data.preview) {
          setPreview(data.preview);
          setSummary(data.summary);
        }
        return;
      }

      setImportResult({ created: data.created, failed: data.failed });
      setStep('done');

      if (data.failed > 0) {
        showToast.success(
          (productsDict.importPartial || 'Imported {created} product(s), {failed} failed')
            .replace('{created}', String(data.created))
            .replace('{failed}', String(data.failed))
        );
      } else {
        showToast.success(
          (productsDict.importSuccess || 'Successfully imported {count} product(s)').replace(
            '{count}',
            String(data.created)
          )
        );
      }

      onComplete();
    } catch {
      showToast.error(productsDict.importError || 'Failed to import products');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-import-title"
        className="bg-white border border-gray-300 max-w-3xl w-full max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
          <h2 id="product-import-title" className="text-base font-semibold">
            {productsDict.importProducts || 'Import Products'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            title={commonDict.close || 'Close'}
            aria-label={commonDict.close || 'Close'}
            className="text-white/70 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 overflow-y-auto">
          <p className="text-sm text-gray-500 mb-4">
            {productsDict.importDescription ||
              'Upload a CSV file to bulk import products. Download the template to see the required format.'}
          </p>

          {step === 'upload' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 inline-flex items-center gap-2 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {productsDict.downloadTemplate || 'Download Template'}
              </button>

              <div className="border-2 border-dashed border-gray-300 hover:border-brand transition-colors p-8 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="product-import-file"
                />
                <label
                  htmlFor="product-import-file"
                  className="cursor-pointer inline-flex flex-col items-center gap-2"
                >
                  <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  {loading && (
                    <span className="win8-spinner win8-spinner-sm text-brand"><span /><span /><span /><span /><span /></span>
                  )}
                  <span className="text-brand font-medium hover:underline">
                    {loading
                      ? productsDict.importPreviewing || 'Validating…'
                      : productsDict.selectCsvFile || 'Select CSV file'}
                  </span>
                  {fileName && !loading && (
                    <span className="text-xs text-gray-500 font-mono">{fileName}</span>
                  )}
                </label>
              </div>
            </div>
          )}

          {step === 'preview' && preview && summary && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-brand-navy text-white p-3">
                  <p className="text-2xl font-bold tabular-nums">{summary.total.toLocaleString()}</p>
                  <p className="text-xs text-white/80">{productsDict.importTotalRows || 'rows'}</p>
                </div>
                <div className="bg-win8-success text-white p-3">
                  <p className="text-2xl font-bold tabular-nums">{summary.valid.toLocaleString()}</p>
                  <p className="text-xs text-white/80">{productsDict.importValid || 'valid'}</p>
                </div>
                <div className={`${summary.errors > 0 ? 'bg-win8-danger' : 'bg-gray-500'} text-white p-3`}>
                  <p className="text-2xl font-bold tabular-nums">{summary.errors.toLocaleString()}</p>
                  <p className="text-xs text-white/80">{productsDict.importInvalid || 'errors'}</p>
                </div>
              </div>

              <div className="overflow-x-auto max-h-64 overflow-y-auto border border-gray-300">
                <table className="w-full text-sm">
                  <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">{productsDict.importRow || 'Row'}</th>
                      <th className="px-3 py-2 text-left font-medium">{productsDict.importStatus || 'Status'}</th>
                      <th className="px-3 py-2 text-left font-medium">{productsDict.name || 'Name'}</th>
                      <th className="px-3 py-2 text-left font-medium">SKU</th>
                      <th className="px-3 py-2 text-right font-medium">{productsDict.price || 'Price'}</th>
                      <th className="px-3 py-2 text-left font-medium">{productsDict.importDetails || 'Details'}</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {preview.map((row) => (
                      <tr key={row.row} className="hover:bg-gray-100 transition-colors">
                        <td className="px-3 py-2 whitespace-nowrap tabular-nums text-gray-500">{row.row}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 text-xs font-semibold text-white ${
                              row.status === 'valid' ? 'bg-win8-success' : 'bg-win8-danger'
                            }`}
                          >
                            {row.status === 'valid'
                              ? productsDict.importValid || 'Valid'
                              : productsDict.importInvalid || 'Invalid'}
                          </span>
                        </td>
                        <td className="px-3 py-2">{row.data?.name || '—'}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-700">{row.data?.sku || '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.data?.price ?? '—'}</td>
                        <td className={`px-3 py-2 text-xs ${row.errors?.length ? 'text-win8-danger' : 'text-gray-500'}`}>
                          {row.errors?.join('; ') || (row.data?.category ? `→ ${row.data.category}` : '—')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep('upload');
                    setPreview(null);
                    setSummary(null);
                    setCsvText('');
                    setFileName('');
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
                >
                  {commonDict.back || 'Back'}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={importing || summary.valid === 0}
                  className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
                >
                  {importing
                    ? commonDict.processing || 'Processing…'
                    : (productsDict.importConfirm || 'Import {count} Products').replace(
                        '{count}',
                        String(summary.valid)
                      )}
                </button>
              </div>
            </div>
          )}

          {step === 'done' && importResult && (
            <div className="space-y-4 text-center py-6">
              <span className="mx-auto w-14 h-14 bg-win8-success text-white flex items-center justify-center" aria-hidden="true">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m5 12 5 5L20 7" /></svg>
              </span>
              <p className="text-lg font-medium text-gray-900">
                {(productsDict.importSuccess || 'Successfully imported {count} product(s)').replace(
                  '{count}',
                  String(importResult.created)
                )}
              </p>
              {importResult.failed > 0 && (
                <p className="text-sm font-medium text-win8-danger">
                  {(productsDict.importPartial || 'Imported {created} product(s), {failed} failed')
                    .replace('{created}', String(importResult.created))
                    .replace('{failed}', String(importResult.failed))}
                </p>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors"
              >
                {commonDict.close || 'Close'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
