/**
 * Time slots for one day of bookings, shared by the public availability endpoint and the
 * staff time-slots endpoint. Slots follow Admin → Business Hours when the store has set them
 * (closed days have none, breaks are unavailable) and are laid out in the store's time zone.
 */
import mongoose from 'mongoose';
import Booking from '@/models/Booking';
import type { ITenantSettings } from '@/types/tenant';
import { getClosedHolidayForDate } from '@/lib/holidays';
import { bookableWindow, hoursTimeZone } from '@/lib/booking-hours';
import { getTenantDayBoundaries, tenantWallTimeToDate, toTenantDateString } from '@/lib/timezone';

const int = (raw: string | null, fallback: number, min: number, max: number) => {
  const n = raw === null ? NaN : parseInt(raw, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};

export interface Slot {
  time: string;
  available: boolean;
  bookingId?: string;
}

export async function buildSlots(opts: {
  tenantId: mongoose.Types.ObjectId | string;
  settings?: Partial<ITenantSettings> | null;
  /** 'YYYY-MM-DD' (a day at the store) or any date the Date constructor reads. */
  dateParam: string;
  staffId?: string | null;
  searchParams: URLSearchParams;
  /** Mark slots that have already started as unavailable (the public page does). */
  hidePast?: boolean;
  /** Include the conflicting booking's id on each taken slot (staff view). */
  withBookingIds?: boolean;
}) {
  const { settings, searchParams } = opts;
  // Bounded so a bad query cannot make the loop below run forever (slotInterval=0) or huge.
  const duration = int(searchParams.get('duration'), 60, 5, 24 * 60);
  const slotInterval = int(searchParams.get('slotInterval'), 30, 5, 240);
  const startHour = int(searchParams.get('startHour'), 9, 0, 23);
  const endHour = int(searchParams.get('endHour'), 17, 1, 24);

  const hours = settings?.businessHours;
  const zone = hoursTimeZone(hours, settings?.timezone);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(opts.dateParam)
    ? opts.dateParam
    : toTenantDateString(new Date(opts.dateParam), zone);
  const dayStart = getTenantDayBoundaries(day, zone || undefined).start;

  // Holidays are stored as calendar days; read this one as noon so any server zone lands on it.
  const [y, m, d] = day.split('-').map(Number);
  const closedHoliday = getClosedHolidayForDate(settings?.holidays as never, new Date(y, m - 1, d, 12));

  const win = bookableWindow(day, hours, settings?.timezone);
  if (win === 'closed') {
    return { slots: [] as Slot[], dayStart, duration, slotInterval, closedHoliday, closedByHours: true };
  }
  const hh = (h: number) => (h === 24 ? '23:59' : `${String(h).padStart(2, '0')}:00`);
  const open = win ? win.open : tenantWallTimeToDate(`${day}T${hh(startHour)}`, zone);
  const close = win ? win.close : tenantWallTimeToDate(`${day}T${hh(Math.max(endHour, startHour + 1))}`, zone);
  const breaks = win ? win.breaks : [];

  // Bookings that overlap the window (this also catches ones carried over from the previous evening).
  const query: Record<string, unknown> = {
    tenantId: opts.tenantId,
    startTime: { $lt: close },
    endTime: { $gt: open },
    status: { $in: ['pending', 'confirmed'] },
  };
  if (opts.staffId && mongoose.Types.ObjectId.isValid(opts.staffId)) query.staffId = opts.staffId;
  const existing = await Booking.find(query).select('startTime endTime').lean();

  const now = Date.now();
  const slots: Slot[] = [];
  for (let t = open.getTime(); t + duration * 60000 <= close.getTime(); t += slotInterval * 60000) {
    const s = new Date(t);
    const e = new Date(t + duration * 60000);
    const conflict = existing.find((b) => s < new Date(b.endTime) && e > new Date(b.startTime));
    const inBreak = breaks.some((b) => s < b.end && e > b.start);
    const past = opts.hidePast && t < now;
    slots.push({
      time: s.toISOString(),
      available: !conflict && !inBreak && !past && !closedHoliday,
      ...(opts.withBookingIds && conflict ? { bookingId: String(conflict._id) } : {}),
    });
  }

  return { slots, dayStart, duration, slotInterval, closedHoliday, closedByHours: false };
}
