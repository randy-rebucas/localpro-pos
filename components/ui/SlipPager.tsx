'use client';

interface SlipPagerProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  label: string;
  previousLabel: string;
  nextLabel: string;
}

const KEY =
  'flex min-h-[44px] items-center justify-center border border-ink/25 px-3 font-receipt text-xs font-medium uppercase text-ink transition-colors hover:bg-paper touch-manipulation disabled:cursor-not-allowed disabled:opacity-40';

/** Previous and next keys for a list printed on a paper slip. Hidden when there is only one page. */
export default function SlipPager({ page, totalPages, onPageChange, label, previousLabel, nextLabel }: SlipPagerProps) {
  if (totalPages <= 1) return null;

  return (
    <nav aria-label={label} className="mt-auto flex items-center justify-between gap-3 border-t border-dashed border-ink/30 px-4 py-2 sm:px-5">
      <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} className={KEY}>
        {previousLabel}
      </button>
      <span className="font-led text-2xl leading-none text-ink">{page}/{totalPages}</span>
      <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} className={KEY}>
        {nextLabel}
      </button>
    </nav>
  );
}
