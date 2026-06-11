'use client';

import { useEffect, useState } from 'react';
import JsBarcode from 'jsbarcode';
import type { Product } from '@/hooks/useProductsList';

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

const btnPrimary =
  'px-4 py-2 bg-brand text-white hover:bg-brand-hover font-medium border border-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const btnSecondary =
  'px-4 py-2 border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 bg-white transition-colors';

interface BulkBarcodeModalProps {
  products: Product[];
  dict: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  onClose: () => void;
}

export default function BulkBarcodeModal({ products, dict, onClose }: BulkBarcodeModalProps) {
  const [format, setFormat] = useState<BarcodeFormat>('CODE128');
  const [labelSizeIdx, setLabelSizeIdx] = useState(0);
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [dataURLs, setDataURLs] = useState<Record<string, string>>({});

  const labelSize = LABEL_SIZES[labelSizeIdx];
  const getCopies = (id: string) => copies[id] ?? 1;

  useEffect(() => {
    const urls: Record<string, string> = {};
    products.forEach((p) => {
      const val = p.barcode || p.sku || p._id;
      const url = renderBarcodeToDataURL(val, format, labelSize.barcodeHeight);
      if (url) urls[p._id] = url;
    });
    setDataURLs(urls);
  }, [products, format, labelSize]);

  const handlePrint = () => {
    const { widthMm, heightMm } = labelSize;

    const labels = products
      .flatMap((p) => {
        const url = dataURLs[p._id];
        if (!url) return [];
        const count = getCopies(p._id);
        const escapedName = p.name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-200 shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {dict.products?.printBarcodes || 'Print Barcodes'}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {products.length} {dict.admin?.selected || 'selected'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
              {dict.products?.labelSize || 'Label Size'}
            </label>
            <select
              value={labelSizeIdx}
              onChange={(e) => setLabelSizeIdx(Number(e.target.value))}
              className="px-3 py-1.5 border border-gray-300 text-sm bg-white"
            >
              {LABEL_SIZES.map((s, i) => (
                <option key={i} value={i}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
              {dict.components?.barcodeModal?.format || 'Format'}
            </label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as BarcodeFormat)}
              className="px-3 py-1.5 border border-gray-300 text-sm bg-white"
            >
              {BARCODE_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {products.map((p) => (
            <div key={p._id} className="flex items-center gap-4 border border-gray-200 p-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{p.name}</div>
                <div className="text-xs text-gray-400 font-mono mt-0.5">{p.barcode || p.sku || p._id}</div>
                <div className="mt-2">
                  {dataURLs[p._id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={dataURLs[p._id]} alt={p.name} className="max-w-full" />
                  ) : (
                    <p className="text-xs text-red-500">Cannot render {format} for this value</p>
                  )}
                </div>
              </div>
              <div className="flex-shrink-0 flex flex-col items-center gap-1">
                <label className="text-xs text-gray-500">{dict.products?.copies || 'Copies'}</label>
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={getCopies(p._id)}
                  onChange={(e) =>
                    setCopies((prev) => ({ ...prev, [p._id]: Math.max(1, parseInt(e.target.value) || 1) }))
                  }
                  className="w-16 px-2 py-1 border border-gray-300 text-sm text-center bg-white"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 justify-end px-5 py-4 border-t border-gray-200">
          <button type="button" onClick={onClose} className={btnSecondary}>
            {dict.common?.cancel || 'Cancel'}
          </button>
          <button type="button" onClick={handlePrint} className={btnPrimary}>
            {dict.components?.barcodeModal?.print || 'Print'}
          </button>
        </div>
      </div>
    </div>
  );
}
