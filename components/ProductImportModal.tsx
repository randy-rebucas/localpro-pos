'use client';

import React, { useRef, useState } from 'react';
import { Download, FileUp } from 'lucide-react';
import { showToast } from '@/lib/toast';
import { downloadCSV } from '@/lib/export';
import { getProductImportTemplateCSV } from '@/lib/product-import';
import { ReceiptRow } from '@/components/marketing/primitives';
import { ICON, KEY, KEY_PRIMARY, Sheet, Strip } from '@/components/admin/register-ui';

interface ImportPreviewRow {
  row: number;
  status: 'valid' | 'error';
  data?: { name: string; sku?: string; price: number; stock: number; category?: string };
  errors?: string[];
}

interface ImportResult {
  created: number;
  failed: number;
  /** Rows the preview had already marked invalid, so they were never sent */
  skipped: number;
  failedRows: Array<{ row: number; name: string; error: string }>;
}

interface ProductImportModalProps {
  dict: Record<string, unknown>;
  onClose: () => void;
  onComplete: () => void;
}

const TH = 'whitespace-nowrap px-3 py-2 text-left font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/60';
const TD = 'px-3 py-2 font-receipt text-sm';

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
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

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
      // Lets the same file be picked again after fixing it
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (!csvText || !summary?.valid || importing) return;

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

      const result: ImportResult = {
        created: data.created ?? 0,
        failed: data.failed ?? 0,
        skipped: data.summary?.errors ?? summary.errors ?? 0,
        failedRows: Array.isArray(data.results?.failed) ? data.results.failed : [],
      };
      setImportResult(result);
      setStep('done');

      // Only a full import is a plain success; anything left out says so
      if (result.failed > 0 || result.skipped > 0) {
        showToast.error(
          (productsDict.importPartial || 'Imported {created} product(s), {failed} failed')
            .replace('{created}', String(result.created))
            .replace('{failed}', String(result.failed + result.skipped))
        );
      } else {
        showToast.success(
          (productsDict.importSuccess || 'Successfully imported {count} product(s)').replace('{count}', String(result.created))
        );
      }

      if (result.created > 0) onComplete();
    } catch {
      showToast.error(productsDict.importError || 'Failed to import products');
    } finally {
      setImporting(false);
    }
  };

  const backToUpload = () => {
    setStep('upload');
    setPreview(null);
    setSummary(null);
    setCsvText('');
    setFileName('');
  };

  const footer =
    step === 'preview' && summary ? (
      <>
        <button type="button" onClick={backToUpload} className={KEY}>
          {commonDict.back || 'Back'}
        </button>
        <button type="button" onClick={handleConfirmImport} disabled={importing || summary.valid === 0} className={KEY_PRIMARY}>
          {importing
            ? commonDict.processing || 'Processing...'
            : (productsDict.importConfirm || 'Import {count} Products').replace('{count}', String(summary.valid))}
        </button>
      </>
    ) : step === 'done' ? (
      <button type="button" onClick={onClose} className={KEY_PRIMARY}>
        {commonDict.close || 'Close'}
      </button>
    ) : undefined;

  const fullImport = importResult && importResult.failed === 0 && importResult.skipped === 0;

  return (
    <Sheet
      title={productsDict.importProducts || 'Import Products'}
      subtitle={
        productsDict.importDescription ||
        'Upload a CSV file to bulk import products. Download the template to see the required format.'
      }
      onClose={onClose}
      closeLabel={commonDict.close || 'Close'}
      wide
      footer={footer}
    >
      {step === 'upload' && (
        <div className="space-y-4">
          <button type="button" onClick={handleDownloadTemplate} className={`${KEY} w-full sm:w-auto`}>
            <Download className={ICON} strokeWidth={1.75} aria-hidden />
            {productsDict.downloadTemplate || 'Download Template'}
          </button>

          <div className="border-2 border-dashed border-ink/30 bg-paper p-8 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileSelect}
              className="sr-only"
              id="product-import-file"
            />
            <label htmlFor="product-import-file" className="inline-flex cursor-pointer flex-col items-center gap-2">
              <FileUp className="h-10 w-10 text-ink/40" strokeWidth={1.5} aria-hidden />
              <span className="font-receipt text-sm font-medium uppercase tracking-[0.08em] text-brand-hover">
                {loading ? productsDict.importPreviewing || 'Validating...' : productsDict.selectCsvFile || 'Select CSV file'}
              </span>
              {fileName && !loading && <span className="font-receipt text-xs text-ink/60">{fileName}</span>}
            </label>
          </div>
        </div>
      )}

      {step === 'preview' && preview && summary && (
        <div className="space-y-4">
          <div className="space-y-1 border-b border-dashed border-ink/30 pb-3 font-receipt text-sm">
            <ReceiptRow label={productsDict.importTotalRows || 'rows'} value={summary.total} />
            <ReceiptRow label={productsDict.importValid || 'valid'} value={summary.valid} />
            <ReceiptRow label={productsDict.importInvalid || 'errors'} value={summary.errors} />
          </div>

          <div className="max-h-72 overflow-auto border border-ink/15">
            <table className="min-w-full divide-y divide-ink/10">
              <thead className="sticky top-0 bg-paper">
                <tr>
                  <th scope="col" className={TH}>{productsDict.importRow || 'Row'}</th>
                  <th scope="col" className={TH}>{productsDict.importStatus || 'Status'}</th>
                  <th scope="col" className={TH}>{productsDict.name || 'Name'}</th>
                  <th scope="col" className={TH}>SKU</th>
                  <th scope="col" className={TH}>{productsDict.price || 'Price'}</th>
                  <th scope="col" className={TH}>{productsDict.importDetails || 'Details'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dashed divide-ink/15 bg-paper-white">
                {preview.map((row) => (
                  <tr key={row.row} className={row.status === 'error' ? 'bg-stamp/5' : ''}>
                    <td className={`${TD} whitespace-nowrap`}>{row.row}</td>
                    <td className={`${TD} whitespace-nowrap`}>
                      <span className={`border px-1.5 py-0.5 text-xs uppercase ${row.status === 'valid' ? 'border-brand-hover text-brand-hover' : 'border-stamp text-stamp'}`}>
                        {row.status === 'valid' ? productsDict.importValid || 'Valid' : productsDict.importInvalid || 'Invalid'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm">{row.data?.name || '—'}</td>
                    <td className={TD}>{row.data?.sku || '—'}</td>
                    <td className={TD}>{row.data?.price ?? '—'}</td>
                    <td className={`${TD} text-xs ${row.errors?.length ? 'text-stamp' : 'text-ink/60'}`}>
                      {row.errors?.join('; ') || (row.data?.category ? `→ ${row.data.category}` : '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 'done' && importResult && (
        <div className="space-y-4">
          <Strip tone={fullImport ? 'ok' : 'error'}>
            {fullImport
              ? (productsDict.importSuccess || 'Successfully imported {count} product(s)').replace('{count}', String(importResult.created))
              : (productsDict.importPartial || 'Imported {created} product(s), {failed} failed')
                  .replace('{created}', String(importResult.created))
                  .replace('{failed}', String(importResult.failed + importResult.skipped))}
          </Strip>

          <div className="space-y-1 font-receipt text-sm">
            <ReceiptRow label={productsDict.importCreated || 'Imported'} value={importResult.created} />
            {importResult.failed > 0 && <ReceiptRow label={productsDict.importFailedRows || 'Failed while saving'} value={importResult.failed} />}
            {importResult.skipped > 0 && <ReceiptRow label={productsDict.importSkippedRows || 'Skipped (invalid rows)'} value={importResult.skipped} />}
          </div>

          {importResult.failedRows.length > 0 && (
            <div>
              <p className="mb-1 font-receipt text-xs font-medium uppercase tracking-[0.08em] text-ink/60">
                {productsDict.importFailedList || 'Rows that were not imported'}
              </p>
              <ul className="max-h-56 divide-y divide-dashed divide-ink/20 overflow-y-auto border-y border-dashed border-ink/30">
                {importResult.failedRows.map((row) => (
                  <li key={row.row} className="flex gap-3 py-2 text-sm">
                    <span className="w-14 shrink-0 font-receipt text-ink/60">#{row.row}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{row.name || '—'}</span>
                      <span className="block font-receipt text-xs text-stamp">{row.error}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {importResult.skipped > 0 && (
            <p className="font-receipt text-xs text-ink/60">
              {productsDict.importSkippedHint || 'Invalid rows were left out. Fix them in the file and import it again; rows already imported will show as duplicates.'}
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
