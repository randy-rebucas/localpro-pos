'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';
import JsBarcode from 'jsbarcode';
import { escapeHtml } from '@/lib/html-escape';
import { Download, Printer } from 'lucide-react';
import { ICON, INPUT, KEY, KEY_PRIMARY, LABEL, Sheet, Strip } from '@/components/admin/register-ui';

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
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const d = dict?.components?.barcodeModal;

  useEffect(() => {
    if (!svgRef.current) return;
    let renderFailed = false;
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
      renderFailed = true;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFailed(renderFailed);
  }, [value, format]);

  const error = failed
    ? (d?.renderError || 'Cannot render {format} for this value. Try CODE128.').replace('{format}', format)
    : null;

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
    // The popup is same-origin with the app; an unescaped product name would run as script there.
    const safeName = escapeHtml(productName);
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Barcode – ${safeName}</title>
        <style>
          body { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif; }
          h2 { font-size: 14px; margin-bottom: 8px; color: #374151; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <h2>${safeName}</h2>
        ${svgStr}
        <script>window.onload = () => { window.print(); window.close(); }<\/script>
      </body>
      </html>
    `);
    win.document.close();
  };

  const closeLabel = dict?.common?.close || 'Close';

  return (
    <Sheet
      title={d?.title || 'Barcode'}
      subtitle={<span className="block truncate">{productName}</span>}
      onClose={onClose}
      closeLabel={closeLabel}
      layer="z-[70]"
      footer={
        <>
          <button type="button" onClick={printBarcode} disabled={!!error} className={KEY}>
            <Printer className={ICON} strokeWidth={1.75} aria-hidden />
            {d?.print || 'Print'}
          </button>
          <button type="button" onClick={downloadSVG} disabled={!!error} className={KEY}>
            <Download className={ICON} strokeWidth={1.75} aria-hidden />
            {d?.downloadSvg || 'Download SVG'}
          </button>
          <button type="button" onClick={downloadPNG} disabled={!!error} className={KEY_PRIMARY}>
            <Download className={ICON} strokeWidth={1.75} aria-hidden />
            {d?.downloadPng || 'Download PNG'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="barcode-format" className={LABEL}>{d?.format || 'Format'}</label>
          <select
            id="barcode-format"
            value={format}
            onChange={e => setFormat(e.target.value as BarcodeFormat)}
            className={INPUT}
          >
            {FORMATS.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col items-center">
          {/* The svg stays mounted even when a format can't render this value, so
              switching back (say, to CODE128) draws into it again */}
          <div className={`w-full justify-center overflow-x-auto border border-dashed border-ink/30 bg-white p-2 ${error ? 'hidden' : 'flex'}`}>
            <svg ref={svgRef} />
          </div>
          {error && <div className="w-full"><Strip tone="error">{error}</Strip></div>}
          <p className="mt-2 font-receipt text-xs text-ink/60">{value}</p>
        </div>
      </div>
    </Sheet>
  );
}
