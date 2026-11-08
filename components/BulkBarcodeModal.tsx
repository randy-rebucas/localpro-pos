'use client';

import { useMemo, useState } from 'react';
import { escapeHtml } from '@/lib/html-escape';
import JsBarcode from 'jsbarcode';
import type { Product } from '@/hooks/useProductsList';
import { Printer } from 'lucide-react';
import { ICON, INPUT, INPUT_BASE, KEY, KEY_PRIMARY, LABEL, Sheet } from '@/components/admin/register-ui';

type BarcodeFormat = 'CODE128' | 'EAN13' | 'EAN8' | 'UPC' | 'CODE39';

interface LabelSize {
  label: string;
  widthMm: number;
  heightMm: number;
  barcodeHeight: number; // px passed to JsBarcode
}

const BARCODE_FORMATS: { label: string; value: BarcodeFormat }[] = [
  { label: 'CODE128', value: 'CODE128' },
  { label: 'EAN-13', value: 'EAN13' },
  { label: 'EAN-8', value: 'EAN8' },
  { label: 'UPC-A', value: 'UPC' },
  { label: 'CODE39', value: 'CODE39' },
];

const LABEL_SIZES: LabelSize[] = [
  { label: '2" × 1"  (50 × 25 mm)',    widthMm: 50.8,  heightMm: 25.4, barcodeHeight: 30 },
  { label: '2" × 1¼" (50 × 32 mm)',    widthMm: 50.8,  heightMm: 31.75, barcodeHeight: 38 },
  { label: '2¼" × 1¼" (57 × 32 mm)',   widthMm: 57.15, heightMm: 31.75, barcodeHeight: 38 },
  { label: '4" × 2"  (102 × 51 mm)',   widthMm: 101.6, heightMm: 50.8,  barcodeHeight: 60 },
  { label: '4" × 3"  (102 × 76 mm)',   widthMm: 101.6, heightMm: 76.2,  barcodeHeight: 90 },
  { label: '40 × 30 mm',              widthMm: 40,    heightMm: 30,    barcodeHeight: 32 },
  { label: '58 × 40 mm',              widthMm: 58,    heightMm: 40,    barcodeHeight: 44 },
];

function renderBarcodeToDataURL(
  value: string,
  format: BarcodeFormat,
  barcodeHeight: number,
): string | null {
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, value, {
      format,
      width: 2,
      height: barcodeHeight,
      displayValue: true,
      fontSize: 10,
      margin: 4,
      background: '#ffffff',
      lineColor: '#000000',
    });
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

/** Copies per label: at least 1, at most 99 (typing 99999 used to build that many label nodes). */
const MAX_COPIES = 99;
const clampCopies = (value: number) => Math.min(MAX_COPIES, Math.max(1, Number.isFinite(value) ? Math.floor(value) : 1));

interface BulkBarcodeModalProps {
  products: Product[];
  dict: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  onClose: () => void;
}

export default function BulkBarcodeModal({ products, dict, onClose }: BulkBarcodeModalProps) {
  const [format, setFormat] = useState<BarcodeFormat>('CODE128');
  const [labelSizeIdx, setLabelSizeIdx] = useState(0);
  const [copies, setCopies] = useState<Record<string, number>>({});

  const labelSize = LABEL_SIZES[labelSizeIdx];
  const getCopies = (id: string) => clampCopies(copies[id] ?? 1);

  // Rendered while rendering (this modal is client-only): no effect + state round trip
  const dataURLs = useMemo(() => {
    const urls: Record<string, string> = {};
    products.forEach((p) => {
      const val = p.barcode || p.sku || p._id;
      const url = renderBarcodeToDataURL(val, format, labelSize.barcodeHeight);
      if (url) urls[p._id] = url;
    });
    return urls;
  }, [products, format, labelSize]);

  const handlePrint = () => {
    const { widthMm, heightMm } = labelSize;

    const labels = products
      .flatMap((p) => {
        const url = dataURLs[p._id];
        if (!url) return [];
        const count = getCopies(p._id);
        const escapedName = escapeHtml(p.name);
        return Array.from(
          { length: count },
          () => `<div class="label"><div class="name">${escapedName}</div><img src="${url}" /></div>`,
        );
      })
      .join('');

    const win = window.open('', '_blank', 'width=600,height=400');
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Barcodes</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page {
      size: ${widthMm}mm ${heightMm}mm;
      margin: 0;
    }
    body {
      width: ${widthMm}mm;
      font-family: sans-serif;
      background: #fff;
    }
    .label {
      width: ${widthMm}mm;
      height: ${heightMm}mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      page-break-after: always;
    }
    .name {
      font-size: 8pt;
      font-weight: 700;
      text-align: center;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-bottom: 1mm;
    }
    img {
      max-width: 100%;
      max-height: calc(${heightMm}mm - 6mm);
      display: block;
    }
  </style>
</head>
<body>
  ${labels}
  <script>setTimeout(function(){ window.print(); }, 300);<\/script>
</body>
</html>`);
    win.document.close();
  };

  const barcodeDict = dict.components?.barcodeModal;
  const cannotRender = (barcodeDict?.renderErrorShort || 'Cannot render {format} for this value').replace('{format}', format);
  const printable = products.some((p) => dataURLs[p._id]);

  return (
    <Sheet
      title={dict.products?.printBarcodes || 'Print Barcodes'}
      subtitle={`${products.length} ${dict.admin?.selected || 'selected'}`}
      onClose={onClose}
      closeLabel={dict.common?.close || 'Close'}
      wide
      footer={
        <>
          <button type="button" onClick={onClose} className={KEY}>
            {dict.common?.cancel || 'Cancel'}
          </button>
          <button type="button" onClick={handlePrint} disabled={!printable} className={KEY_PRIMARY}>
            <Printer className={ICON} strokeWidth={1.75} aria-hidden />
            {barcodeDict?.print || 'Print'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 border-b border-dashed border-ink/30 pb-4 sm:grid-cols-2">
        <div>
          <label htmlFor="bulk-barcode-size" className={LABEL}>{dict.products?.labelSize || 'Label Size'}</label>
          <select
            id="bulk-barcode-size"
            value={labelSizeIdx}
            onChange={(e) => setLabelSizeIdx(Number(e.target.value))}
            className={INPUT}
          >
            {LABEL_SIZES.map((s, i) => (
              <option key={s.label} value={i}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="bulk-barcode-format" className={LABEL}>{barcodeDict?.format || 'Format'}</label>
          <select
            id="bulk-barcode-format"
            value={format}
            onChange={(e) => setFormat(e.target.value as BarcodeFormat)}
            className={INPUT}
          >
            {BARCODE_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>

      <ul className="divide-y divide-dashed divide-ink/20">
        {products.map((p) => (
          <li key={p._id} className="flex items-center gap-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.name}</p>
              <p className="mt-0.5 font-receipt text-xs text-ink/60">{p.barcode || p.sku || p._id}</p>
              <div className="mt-2">
                {dataURLs[p._id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={dataURLs[p._id]} alt={p.name} className="max-w-full bg-white" />
                ) : (
                  <p className="border-l-2 border-stamp pl-2 font-receipt text-xs text-stamp">{cannotRender}</p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-center">
              <label htmlFor={`copies-${p._id}`} className={LABEL}>{dict.products?.copies || 'Copies'}</label>
              <input
                id={`copies-${p._id}`}
                type="number"
                inputMode="numeric"
                min="1"
                max={MAX_COPIES}
                value={getCopies(p._id)}
                onChange={(e) => setCopies((prev) => ({ ...prev, [p._id]: clampCopies(parseInt(e.target.value, 10)) }))}
                className={`${INPUT_BASE} w-20 text-center font-receipt`}
              />
            </div>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
