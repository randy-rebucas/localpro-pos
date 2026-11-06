import type { ReactNode } from 'react';

/** Looks up home page copy from the dictionary, with English as the server-rendered default. */
export type Translate = (key: string, fallback: string) => string;

const BAR_WIDTHS = [2, 1, 3, 1, 1, 2, 4, 1, 2, 1, 1, 3, 2, 1, 3, 1, 2, 2, 1, 4, 1, 1, 2, 3, 1, 2, 1, 3, 1, 1, 2, 1, 4, 2, 1];
const BAR_OFFSETS = BAR_WIDTHS.map((_, i) => BAR_WIDTHS.slice(0, i).reduce((sum, width) => sum + width, 0));
const BARCODE_WIDTH = BAR_WIDTHS.reduce((sum, width) => sum + width, 0);

export function Barcode({ className = '' }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${BARCODE_WIDTH} 40`} preserveAspectRatio="none" className={className} fill="currentColor" aria-hidden="true">
      {BAR_WIDTHS.map((width, i) => (i % 2 === 0 ? <rect key={i} x={BAR_OFFSETS[i]} y={0} width={width} height={40} /> : null))}
    </svg>
  );
}

/** Section label set like a receipt line: item number, dotted leader, name. */
export function LineTag({ no, children, className = '' }: { no: string; children: ReactNode; className?: string }) {
  return (
    <p className={`flex items-baseline gap-2 font-receipt text-xs font-medium uppercase tracking-[0.14em] ${className}`}>
      <span>{no}</span>
      <span className="mk-leader max-w-16" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export function ReceiptRow({ label, value, strong = false }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-baseline gap-2 ${strong ? 'font-semibold' : ''}`}>
      <span>{label}</span>
      <span className="mk-leader" aria-hidden="true" />
      <span className="whitespace-nowrap">{value}</span>
    </div>
  );
}
