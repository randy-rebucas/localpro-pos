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
    <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-300 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {productsDict.importProducts || 'Import Products'}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {productsDict.importDescription ||
                  'Upload a CSV file to bulk import products. Download the template to see the required format.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
              aria-label={commonDict.close || 'Close'}
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {step === 'upload' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium border border-gray-300 inline-flex items-center gap-2 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {productsDict.downloadTemplate || 'Download Template'}
              </button>

              <div className="border-2 border-dashed border-gray-300 p-8 text-center">
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
                  <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span className="text-brand font-medium">
                    {loading
                      ? productsDict.importPreviewing || 'Validating...'
                      : productsDict.selectCsvFile || 'Select CSV file'}
                  </span>
                  {fileName && !loading && (
                    <span className="text-sm text-gray-500">{fileName}</span>
                  )}
                </label>
              </div>
            </div>
          )}

          {step === 'preview' && preview && summary && (
            <div className="space-y-4">
              <div className="flex gap-4 p-3 bg-gray-50 border border-gray-200 text-sm">
                <span>
                  <strong>{summary.total}</strong> {productsDict.importTotalRows || 'rows'}
                </span>
                <span className="text-green-700">
                  <strong>{summary.valid}</strong> {productsDict.importValid || 'valid'}
                </span>
                <span className="text-red-700">
                  <strong>{summary.errors}</strong> {productsDict.importInvalid || 'errors'}
                </span>
              </div>

              <div className="overflow-x-auto max-h-64 border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        {productsDict.importRow || 'Row'}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        {productsDict.importStatus || 'Status'}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        {productsDict.name || 'Name'}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        {productsDict.price || 'Price'}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        {productsDict.importDetails || 'Details'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {preview.map((row) => (
                      <tr key={row.row} className={row.status === 'error' ? 'bg-red-50' : ''}>
                        <td className="px-3 py-2 whitespace-nowrap">{row.row}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 text-xs font-semibold border ${
                              row.status === 'valid'
                                ? 'border-green-300 bg-green-50 text-green-800'
                                : 'border-red-300 bg-red-50 text-red-800'
                            }`}
                          >
                            {row.status === 'valid'
                              ? productsDict.importValid || 'Valid'
                              : productsDict.importInvalid || 'Invalid'}
                          </span>
                        </td>
                        <td className="px-3 py-2">{row.data?.name || '—'}</td>
                        <td className="px-3 py-2">{row.data?.sku || '—'}</td>
                        <td className="px-3 py-2">{row.data?.price ?? '—'}</td>
                        <td className="px-3 py-2 text-xs text-red-700">
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
                  className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium"
                >
                  {commonDict.back || 'Back'}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={importing || summary.valid === 0}
                  className="px-4 py-2 bg-brand text-white hover:bg-brand-hover font-medium border border-brand-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {importing
                    ? commonDict.processing || 'Processing...'
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
              <div className="text-green-600 text-5xl mb-2">✓</div>
              <p className="text-lg font-medium text-gray-900">
                {(productsDict.importSuccess || 'Successfully imported {count} product(s)').replace(
                  '{count}',
                  String(importResult.created)
                )}
              </p>
              {importResult.failed > 0 && (
                <p className="text-sm text-red-600">
                  {(productsDict.importPartial || 'Imported {created} product(s), {failed} failed')
                    .replace('{created}', String(importResult.created))
                    .replace('{failed}', String(importResult.failed))}
                </p>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-brand text-white hover:bg-brand-hover font-medium border border-brand-hover"
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
