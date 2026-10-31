import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

export function ArrowIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return <ArrowRight className={className} strokeWidth={2.5} aria-hidden="true" />;
}

/** Small keycap label, e.g. "F1" — the section's "function key" on the register. */
export function FKey({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <span
      className={`${dark ? 'mk-key' : 'mk-key-light'} inline-flex items-center justify-center h-6 min-w-8 px-1.5 rounded text-[10px] font-bold font-mono tracking-wider`}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

/**
 * Compact section header: function-key + eyebrow on top, title and description left,
 * optional controls (tabs, links) right-aligned on wide screens.
 */
export function SectionHeader({
  id,
  fkey,
  eyebrow,
  title,
  desc,
  dark = false,
  aside,
}: {
  id: string;
  fkey: string;
  eyebrow: string;
  title: string;
  desc?: string;
  dark?: boolean;
  aside?: ReactNode;
}) {
  return (
    <div className={`mk-reveal flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 pb-5 mb-6 border-b ${dark ? 'border-white/10' : 'border-gray-200'}`}>
      <div className="max-w-2xl">
        <div className="flex items-center gap-2 mb-2">
          <FKey dark={dark}>{fkey}</FKey>
          <span className={`text-[11px] font-bold uppercase tracking-[0.18em] ${dark ? 'text-brand-muted' : 'text-brand'}`}>{eyebrow}</span>
        </div>
        <h2 id={id} className={`text-2xl md:text-3xl font-bold tracking-tight ${dark ? 'text-white' : 'text-gray-900'}`}>
          {title}
        </h2>
        {desc && <p className={`mt-1.5 text-sm md:text-[15px] leading-relaxed ${dark ? 'text-white/65' : 'text-gray-500'}`}>{desc}</p>}
      </div>
      {aside}
    </div>
  );
}
