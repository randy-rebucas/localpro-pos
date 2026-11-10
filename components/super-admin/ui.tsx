'use client';

import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Loader2, type LucideIcon } from 'lucide-react';
import { LineTag } from '@/components/marketing/primitives';

/**
 * Super-admin pages in the till look. The shell (components/super-admin/Shell.tsx) already
 * loads the fonts and sets `.mk-root` on a dark navy page, so pages only add `SaPage` and
 * lay paper slips (`Slip`) on it. Keys, fields, strips and sheets come from the tenant admin kit.
 */
export {
  ICON,
  DARK_LABEL,
  DARK_FIELD,
  DARK_KEY,
  DARK_KEY_PRIMARY,
  LABEL,
  INPUT_BASE,
  INPUT,
  CHECKBOX,
  HINT,
  KEY,
  KEY_PRIMARY,
  CHECK_ROW,
  ROW_KEY,
  LedReadout,
  Strip,
  Sheet,
} from '@/components/admin/register-ui';

/** A destructive key on paper. */
export const KEY_DANGER =
  'flex min-h-[44px] items-center justify-center gap-2 bg-stamp px-5 font-receipt text-xs font-semibold uppercase tracking-[0.08em] text-paper-white transition-colors hover:bg-[#a83423] touch-manipulation disabled:cursor-not-allowed disabled:opacity-50';
/** A smaller key for use inside table rows. */
export const KEY_SM =
  'inline-flex min-h-[36px] items-center justify-center gap-1.5 border border-ink/25 px-3 font-receipt text-[11px] font-medium uppercase tracking-[0.08em] text-ink transition-colors hover:bg-paper touch-manipulation disabled:cursor-not-allowed disabled:opacity-50';
export const KEY_SM_DANGER =
  'inline-flex min-h-[36px] items-center justify-center gap-1.5 border border-stamp/40 px-3 font-receipt text-[11px] font-medium uppercase tracking-[0.08em] text-stamp transition-colors hover:bg-stamp/10 touch-manipulation disabled:cursor-not-allowed disabled:opacity-50';
/** A square icon-only key for row actions on paper. Always pass a `label`; see IconKey. */
export const ICON_KEY =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center border border-ink/25 text-ink transition-colors hover:bg-paper touch-manipulation disabled:cursor-not-allowed disabled:opacity-50';
export const ICON_KEY_DANGER =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center border border-stamp/40 text-stamp transition-colors hover:bg-stamp/10 touch-manipulation disabled:cursor-not-allowed disabled:opacity-50';

/** An icon-only row action. The label is read by screen readers and shown as a tooltip on hover. */
export function IconKey({ icon: Icon, label, onClick, tone = 'default', disabled = false, busy = false }: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  /** Shows a spinner and disables the key while its action runs. */
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-label={label}
      aria-busy={busy || undefined}
      title={label}
      className={tone === 'danger' ? ICON_KEY_DANGER : ICON_KEY}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" strokeWidth={1.75} aria-hidden />
      ) : (
        <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      )}
    </button>
  );
}

/** A text link inside paper; globals.css gives links a 44px floor, so center the text. */
export const LINK = 'inline-flex items-center gap-1 font-receipt text-xs font-medium uppercase tracking-[0.08em] text-brand-hover underline-offset-4 hover:underline';
export const SELECT = 'min-h-[44px] border border-ink/25 bg-white px-3 py-2 text-sm text-ink focus:border-brand-hover focus:outline-none focus:ring-2 focus:ring-brand-hover/30';
export const TEXTAREA = 'w-full border border-ink/25 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-brand-hover focus:outline-none focus:ring-2 focus:ring-brand-hover/30';

// Tables printed on a slip
export const TABLE = 'min-w-full text-left';
export const THEAD = 'border-b border-dashed border-ink/30';
export const TBODY = 'divide-y divide-dashed divide-ink/20';
export const TH = 'whitespace-nowrap px-4 py-2 text-left font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/60';
export const TH_RIGHT = 'whitespace-nowrap px-4 py-2 text-right font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/60';
export const TR = 'align-top transition-colors hover:bg-paper';
/** Printed values: dates, amounts, codes. */
export const TD = 'px-4 py-3 font-receipt text-sm';
/** Names and prose. */
export const TD_TEXT = 'px-4 py-3 text-sm';
export const TD_RIGHT = 'whitespace-nowrap px-4 py-3 text-right font-receipt text-sm';

/** The dark super-admin page: tag, heading, an optional readout or keys on the right. */
export function SaPage({ tagNo, tag, title, subtitle, side, children }: {
  tagNo: string;
  tag?: string;
  title: string;
  subtitle?: ReactNode;
  side?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          {tag && <LineTag no={tagNo} className="mb-3 text-[#8fe3d0]">{tag}</LineTag>}
          <h1 className="text-5xl text-paper-white sm:text-6xl lg:text-7xl">{title}</h1>
          {subtitle && <p className="mt-3 max-w-2xl text-paper/70">{subtitle}</p>}
        </div>
        {side && <div className="flex flex-wrap items-center gap-2">{side}</div>}
      </div>
      {children}
    </div>
  );
}

/** A paper slip laid on the dark page. `title` prints as a mono header line with a dashed rule. */
export function Slip({ title, action, tear = false, className = '', bodyClassName = '', children }: {
  title?: ReactNode;
  action?: ReactNode;
  tear?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={className}>
      <div className="bg-paper-white text-ink">
        {(title || action) && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-ink/30 px-4 py-3 sm:px-5">
            {title && <h2 className="font-receipt! text-xs! font-medium! uppercase! leading-normal! tracking-[0.14em]! text-ink/70">{title}</h2>}
            {action}
          </div>
        )}
        <div className={bodyClassName}>{children}</div>
      </div>
      {tear && <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />}
    </section>
  );
}

/** A big number on the till's display, with a printed label. For stat rows on the dark page. */
export function LedStat({ label, value, note, tone = 'default' }: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: 'default' | 'warn' | 'alert';
}) {
  const color = tone === 'alert' ? 'text-[#ff9a85]' : tone === 'warn' ? 'text-[#ffd27a]' : 'text-[#7df0d6]';
  return (
    <div className="border border-white/10 bg-black/30 px-4 py-4">
      <p className="font-receipt text-xs uppercase tracking-[0.14em] text-white/60">{label}</p>
      <p className={`mk-led-glow mt-2 font-led text-4xl leading-none sm:text-5xl ${color}`}>{value}</p>
      {note && <p className="mt-2 font-receipt text-xs text-white/50">{note}</p>}
    </div>
  );
}

export type TagTone = 'ok' | 'warn' | 'bad' | 'info' | 'muted';

const TAG_TONE: Record<TagTone, string> = {
  ok: 'border-brand-hover/50 bg-brand-soft text-brand-hover',
  warn: 'border-[#b7791f]/40 bg-[#fdf3dc] text-[#8a5a12]',
  bad: 'border-stamp/40 bg-stamp/10 text-stamp',
  info: 'border-brand-navy/30 bg-brand-navy/5 text-brand-navy',
  muted: 'border-ink/20 bg-ink/5 text-ink/60',
};

/** A status printed as a small boxed code, like a receipt flag. */
export function Tag({ tone = 'muted', children }: { tone?: TagTone; children: ReactNode }) {
  return (
    <span className={`inline-block whitespace-nowrap border px-1.5 py-0.5 font-receipt text-[11px] uppercase tracking-[0.06em] ${TAG_TONE[tone]}`}>
      {children}
    </span>
  );
}

/** Maps common status words to a tag tone. */
export function statusTone(status: string | undefined | null): TagTone {
  const s = (status || '').toLowerCase();
  if (['active', 'paid', 'success', 'succeeded', 'completed', 'enabled', 'verified', 'trialing', 'trial'].includes(s)) {
    return s.startsWith('trial') ? 'info' : 'ok';
  }
  if (['pending', 'past_due', 'grace', 'grace_period', 'warning', 'processing', 'scheduled', 'running'].includes(s)) return 'warn';
  if (['failed', 'cancelled', 'canceled', 'expired', 'suspended', 'inactive', 'error', 'refunded', 'disabled', 'overdue'].includes(s)) return 'bad';
  return 'muted';
}

/** Loading line for a slip or the page. */
export function Printing({ label = 'Printing…', dark = false }: { label?: string; dark?: boolean }) {
  return (
    <div role="status" className={`flex items-center justify-center gap-2 px-4 py-14 font-receipt text-sm ${dark ? 'text-paper/70' : 'text-ink/60'}`}>
      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" strokeWidth={1.75} aria-hidden />
      {label}
    </div>
  );
}

/** Nothing to print. */
export function Empty({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="px-4 py-14 text-center">
      {icon && <div className="mx-auto mb-2 flex justify-center text-ink/25">{icon}</div>}
      <p className="font-receipt text-sm text-ink/60">{children}</p>
    </div>
  );
}

/** Default rows per page for super-admin lists. */
export const PAGE_SIZE = 10;

/** Page numbers to print: first, last, and the current page with one neighbour each side; null marks a gap. */
export function pageWindow(page: number, totalPages: number): (number | null)[] {
  const wanted = new Set([1, totalPages, page - 1, page, page + 1]);
  const pages = [...wanted].filter(n => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  pages.forEach((n, i) => {
    if (i > 0) {
      const gap = n - pages[i - 1];
      if (gap === 2) out.push(n - 1); // a single hidden page is cheaper to print than a gap
      else if (gap > 2) out.push(null);
    }
    out.push(n);
  });
  return out;
}

/**
 * The foot of a paged slip: which rows are showing, and keys to move between pages.
 * Pass `total` and `limit` for the "Showing 1–10 of 123" line; without them only the keys print.
 * Prints nothing when there is a single page and no total.
 */
export function SaPager({ page, totalPages, onPageChange, total, limit, noun = 'records' }: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  total?: number;
  limit?: number;
  noun?: string;
}) {
  const showRange = total !== undefined && limit !== undefined && total > 0;
  if (totalPages <= 1 && !showRange) return null;

  const first = showRange ? (page - 1) * limit + 1 : 0;
  const last = showRange ? Math.min(page * limit, total) : 0;
  const key = 'flex h-11 min-w-11 items-center justify-center border border-ink/25 px-2 font-receipt text-xs font-medium text-ink transition-colors hover:bg-paper touch-manipulation disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-ink/30 px-4 py-2 sm:px-5">
      {showRange ? (
        <p className="font-receipt text-xs text-ink/60" aria-live="polite">
          Showing {first.toLocaleString()}–{last.toLocaleString()} of {total.toLocaleString()} {noun}
        </p>
      ) : <span />}

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} className={key} aria-label="Previous page" title="Previous page">
            <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>

          {/* Numbered keys from sm; below that the till display shows where you are. */}
          <span className="px-2 font-led text-2xl leading-none text-ink sm:hidden">{page}/{totalPages}</span>
          <ul className="hidden items-center gap-1 sm:flex">
            {pageWindow(page, totalPages).map((n, i) =>
              n === null ? (
                <li key={`gap-${i}`} className="w-6 text-center font-receipt text-xs text-ink/40" aria-hidden>…</li>
              ) : (
                <li key={n}>
                  <button
                    type="button"
                    onClick={() => onPageChange(n)}
                    aria-current={n === page ? 'page' : undefined}
                    aria-label={`Page ${n}`}
                    className={n === page ? `${key} border-ink bg-ink text-paper-white hover:bg-ink` : key}
                  >
                    {n}
                  </button>
                </li>
              ),
            )}
          </ul>

          <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} className={key} aria-label="Next page" title="Next page">
            <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      )}
    </nav>
  );
}

/** Peso amount for printed values. Doto has no ₱ glyph, so amounts stay in font-receipt. */
export function peso(amount: number | undefined | null, currency = 'PHP') {
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}
