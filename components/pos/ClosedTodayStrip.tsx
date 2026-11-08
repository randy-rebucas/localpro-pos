'use client';

import { useEffect, useState } from 'react';
import { CalendarX } from 'lucide-react';
import { getClosedHolidayForDate, type Holiday } from '@/lib/holidays';

/**
 * A warning at the register when today is a closed day on the holiday calendar.
 * It never blocks a sale: the store may open anyway. Holidays are fetched once
 * (they are not part of the tenant settings payload) and "today" is re-read each
 * minute in the store's time zone, so a register left open past midnight catches up.
 */
export default function ClosedTodayStrip({ tenant, timeZone, template }: {
  tenant: string;
  timeZone?: string;
  /** Text with a `{name}` slot for the holiday's name. */
  template: string;
}) {
  const [holidays, setHolidays] = useState<Holiday[] | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/tenants/${encodeURIComponent(tenant)}/holidays`, { credentials: 'include', signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && Array.isArray(data.data)) setHolidays(data.data);
      })
      // Offline or no access: no warning, the register carries on.
      .catch(() => {});
    return () => controller.abort();
  }, [tenant]);

  useEffect(() => {
    if (!holidays?.length) return;
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, [holidays]);

  let closed: Holiday | null = null;
  try {
    closed = getClosedHolidayForDate(holidays ?? undefined, now, timeZone);
  } catch {
    // An unknown time zone name: fall back to the device's day.
    closed = getClosedHolidayForDate(holidays ?? undefined, now);
  }
  if (!closed) return null;

  return (
    <div role="status" className="flex items-center gap-2 border-b border-stamp/30 border-l-4 border-l-stamp bg-paper-white px-3 py-2 font-receipt text-xs text-ink sm:px-4">
      <CalendarX className="h-4 w-4 shrink-0 text-stamp" strokeWidth={1.75} aria-hidden />
      <span className="min-w-0">{template.replace('{name}', closed.name)}</span>
    </div>
  );
}
