import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * 1POS keycap mark — the "1" key on a till. Source of truth for
 * public/brand/*.svg and the PNG icons; see docs/brand.md before changing.
 */
export function BrandMark({ className, title }: { className?: string; title?: string }) {
  const gradientId = `bm-${useId()}`;
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn('shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4cb0b5" />
          <stop offset="1" stopColor="#2c8489" />
        </linearGradient>
      </defs>
      <rect x="2" y="5" width="60" height="57" rx="14" fill="#1b5a5e" />
      <rect x="2" y="2" width="60" height="55" rx="14" fill={`url(#${gradientId})`} />
      <path d="M16 2h32a14 14 0 0 1 14 14v13.5H2V16A14 14 0 0 1 16 2z" fill="#fff" fillOpacity=".13" />
      <path d="M30.5 14h9v32h-9V25.6l-6.2 4.2v-8.6z" fill="#fff" />
      <circle cx="50" cy="14.5" r="3.2" fill="#8dffb8" />
    </svg>
  );
}

/** Mark + "pos" wordmark; the mark reads as the "1". Text inherits colour, so set it on the parent. */
export function BrandLogo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 font-black tracking-[-0.04em] text-xl leading-none', className)}>
      <BrandMark className={cn('h-8 w-8', markClassName)} />
      <span aria-hidden>pos</span>
      <span className="sr-only">1POS</span>
    </span>
  );
}
