'use client';

import { useId, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { LineTag } from '@/components/marketing/primitives';

/**
 * Shared pieces for admin pages in the till look: the dark page with its heading,
 * paper sheets for forms, printed strips for messages, and the key and field styles.
 * Admin pages wrap their content in `RegisterPage`; the admin layout already loads the fonts.
 */

export const ICON = 'h-4 w-4 shrink-0';

// On the dark page
export const DARK_LABEL = 'mb-1 block font-receipt text-xs font-medium uppercase tracking-[0.08em] text-white/60';
export const DARK_FIELD = 'w-full min-h-[44px] border-2 border-transparent bg-paper-white px-3 py-2 font-receipt text-sm text-ink focus:border-[#8fe3d0] focus:outline-none';
export const DARK_KEY = 'flex min-h-[44px] items-center justify-center gap-2 border border-white/25 px-4 font-receipt text-xs font-medium uppercase tracking-[0.08em] text-paper transition-colors hover:bg-white/10 touch-manipulation disabled:cursor-not-allowed disabled:opacity-50';
export const DARK_KEY_PRIMARY = 'flex min-h-[44px] items-center justify-center gap-2 bg-brand px-5 font-receipt text-xs font-semibold uppercase tracking-[0.08em] text-ink transition-colors hover:bg-[#8fe3d0] touch-manipulation';

// On paper (slips and sheets)
export const LABEL = 'mb-1 block font-receipt text-xs font-medium uppercase tracking-[0.08em] text-ink/60';
/** A text field without a width, for use beside other controls. */
export const INPUT_BASE = 'min-h-[44px] border border-ink/25 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-brand-hover focus:outline-none focus:ring-2 focus:ring-brand-hover/30 disabled:bg-ink/5 disabled:text-ink/40';
export const INPUT = `${INPUT_BASE} w-full`;
export const CHECKBOX = 'h-5 w-5 shrink-0 cursor-pointer accent-ink';
export const HINT = 'mt-1 font-receipt text-xs text-ink/60';
export const KEY = 'flex min-h-[44px] items-center justify-center gap-2 border border-ink/25 px-4 font-receipt text-xs font-medium uppercase tracking-[0.08em] text-ink transition-colors hover:bg-paper touch-manipulation disabled:cursor-not-allowed disabled:opacity-50';
export const KEY_PRIMARY = 'flex min-h-[44px] items-center justify-center gap-2 bg-ink px-5 font-receipt text-xs font-semibold uppercase tracking-[0.08em] text-paper-white transition-colors hover:bg-brand-navy touch-manipulation disabled:cursor-not-allowed disabled:opacity-50';
export const CHECK_ROW = 'flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-ink';
/** A square icon key inside a row on paper. */
export const ROW_KEY = 'flex h-11 w-11 items-center justify-center text-ink/60 transition-colors hover:bg-paper hover:text-ink touch-manipulation';

/** The dark admin page with its tag, heading and an optional readout on the right. */
export function RegisterPage({ tag, tagNo, title, subtitle, side, children }: {
  tag?: string;
  tagNo: string;
  title: string;
  subtitle?: string;
  side?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mk-root pos-register">
      <div className="min-h-[calc(100dvh-3.5rem)] bg-brand-navy-deep text-paper lg:min-h-dvh">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="min-w-0">
              {tag && <LineTag no={tagNo} className="mb-3 text-[#8fe3d0]">{tag}</LineTag>}
              <h1 className="text-5xl text-paper-white sm:text-6xl lg:text-7xl">{title}</h1>
              {subtitle && <p className="mt-3 text-paper/70">{subtitle}</p>}
            </div>
            {side}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

/** A number on the till's display, with its label. */
export function LedReadout({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 border border-white/10 bg-black/30 px-4 py-2">
      <span className="mk-led-glow font-led text-4xl leading-none text-[#7df0d6]">{value}</span>
      <span className="font-receipt text-xs uppercase tracking-[0.14em] text-white/60">{label}</span>
    </div>
  );
}

/** A problem or confirmation printed on a strip of paper. */
export function Strip({ tone, children }: { tone: 'ok' | 'error'; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`border-l-4 bg-paper-white px-4 py-3 font-receipt text-sm text-ink ${tone === 'error' ? 'border-stamp' : 'border-brand-hover'}`}
    >
      {children}
    </div>
  );
}

/** A paper form laid over the page, with its keys at the foot. */
export function Sheet({ title, subtitle, onClose, closeLabel, footer, wide = false, layer = 'z-50', children }: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  closeLabel: string;
  footer?: ReactNode;
  wide?: boolean;
  layer?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <div className={`fixed inset-0 ${layer} flex items-center justify-center bg-ink/60 p-3 sm:p-4`}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex max-h-[92dvh] w-full flex-col bg-paper-white text-ink ${wide ? 'max-w-2xl' : 'max-w-lg'}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-dashed border-ink/30 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-3xl sm:text-4xl">{title}</h2>
            {subtitle && <div className="mt-1 text-sm text-ink/65">{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} className={`${ROW_KEY} -mr-2 shrink-0`} aria-label={closeLabel} title={closeLabel}>
            <X className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-dashed border-ink/30 px-4 py-3 sm:px-5">{footer}</div>
        )}
      </div>
    </div>
  );
}
