import { getStatusLabel, type BookingStatus } from '@/lib/bookings-helpers';

/** How each status prints on paper: a tag, and a bar down the side of a calendar entry. */
export const STATUS_TONE: Record<BookingStatus, { tag: string; bar: string }> = {
  pending: { tag: 'border border-ink/40 text-ink', bar: 'border-ink/40' },
  confirmed: { tag: 'border border-brand bg-brand text-ink', bar: 'border-brand' },
  completed: { tag: 'border border-ink bg-ink text-paper-white', bar: 'border-ink' },
  cancelled: { tag: 'border border-stamp text-stamp line-through', bar: 'border-stamp' },
  'no-show': { tag: 'border border-dashed border-stamp text-stamp', bar: 'border-stamp/50' },
};

export default function BookingStatusTag({ status, dict, className = '' }: {
  status: BookingStatus;
  dict: { admin?: Record<string, string | undefined> } | null;
  className?: string;
}) {
  return (
    <span className={`inline-block whitespace-nowrap px-1.5 py-0.5 font-receipt text-[11px] uppercase ${STATUS_TONE[status].tag} ${className}`}>
      {getStatusLabel(status, dict)}
    </span>
  );
}
