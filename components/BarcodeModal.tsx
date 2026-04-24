'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';
import JsBarcode from 'jsbarcode';

interface BarcodeModalProps {
  value: string;       // barcode value
  productName: string;
  onClose: () => void;
}

type BarcodeFormat = 'CODE128' | 'EAN13' | 'EAN8' | 'UPC' | 'CODE39';

const FORMATS: { label: string; value: BarcodeFormat }[] = [
  { label: 'CODE128', value: 'CODE128' },
  { label: 'EAN-13', value: 'EAN13' },
  { label: 'EAN-8', value: 'EAN8' },
  { label: 'UPC-A', value: 'UPC' },
  { label: 'CODE39', value: 'CODE39' },
];

export default function BarcodeModal({ value, productName, onClose }: BarcodeModalProps) {
  const params = useParams();
  const lang = (params?.lang as 'en' | 'es') || 'en';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const svgRef = useRef<SVGSVGElement>(null);
  const [format, setFormat] = useState<BarcodeFormat>('CODE128');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const d = dict?.components?.barcodeModal;

  useEffect(() => {
    if (!svgRef.current) return;
    let renderError: string | null = null;
    try {
      JsBarcode(svgRef.current, value, {
        format,
        width: 2,
        height: 80,
        displayValue: true,
        fontSize: 14,
        margin: 10,
        background: '#ffffff',
        lineColor: '#000000',
      });
    } catch {
      renderError = (d?.renderError || 'Cannot render {format} for this value. Try CODE128.').replace('{format}', format);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(renderError);
  }, [value, format]);

  const downloadSVG = () => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgRef.current);
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `barcode-${productName.replace(/\s+/g, '-').toLowerCase()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPNG = () => {
    if (!svgRef.current) return;
    const svg = svgRef.current;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const canvas = document.createElement('canvas');
    const scale = 3; // high-res
    canvas.width = svg.clientWidth * scale || 400 * scale;
    canvas.height = svg.clientHeight * scale || 150 * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const img = new window.Image();
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const pngUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = `barcode-${productName.replace(/\s+/g, '-').toLowerCase()}.png`;
      a.click();
    };
    img.src = url;
  };

  const printBarcode = () => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgRef.current);
    const win = window.open('', '_blank', 'width=400,height=300');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Barcode – ${productName}</title>
        <style>
          body { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif; }
          h2 { font-size: 14px; margin-bottom: 8px; color: #374151; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <h2>${productName}</h2>
        ${svgStr}
        <script>window.onload = () => { window.print(); window.close(); }<\/script>
      </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <div className="bg-white border border-gray-200 shadow-xl w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{d?.title || 'Barcode'}</h3>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[200px]">{productName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Format selector */}
        <div className="px-5 pt-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">{d?.format || 'Format'}</label>
          <select
            value={format}
            onChange={e => setFormat(e.target.value as BarcodeFormat)}
            className="w-full px-3 py-2 border border-gray-300 text-sm bg-white"
          >
            {FORMATS.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        {/* Barcode preview */}
        <div className="px-5 py-4 flex flex-col items-center">
          {error ? (
            <p className="text-sm text-red-600 text-center py-6">{error}</p>
          ) : (
            <div className="border border-gray-200 bg-white p-2 w-full flex justify-center overflow-x-auto">
              <svg ref={svgRef} />
            </div>
          )}
          <p className="text-xs text-gray-400 mt-2 font-mono">{value}</p>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadPNG}
            disabled={!!error}
            className="flex-1 px-3 py-2 bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-40"
          >
            {d?.downloadPng || 'Download PNG'}
          </button>
          <button
            type="button"
            onClick={downloadSVG}
            disabled={!!error}
            className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 disabled:opacity-40"
          >
            {d?.downloadSvg || 'Download SVG'}
          </button>
          <button
            type="button"
            onClick={printBarcode}
            disabled={!!error}
            className="w-full px-3 py-2 border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 disabled:opacity-40"
          >
            {d?.print || 'Print'}
          </button>
        </div>
      </div>
    </div>
  );
}
