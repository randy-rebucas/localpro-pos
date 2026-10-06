type BookingRow = {
  id: string;
  staffId: string | null;
  status?: unknown;
  staff?: { name: string; email: string } | null;
  [key: string]: unknown;
};

/**
 * Prisma's BookingStatus enum names the no-show member `no_show` (db value
 * 'no-show'); the client and lib/bookings-helpers.ts use 'no-show'. Convert at
 * the API boundary in both directions.
 */
export function toAppBookingStatus<T>(status: T): T {
  return (status === 'no_show' ? 'no-show' : status) as T;
}

export function toDbBookingStatus<T>(status: T): T {
  return (status === 'no-show' ? 'no_show' : status) as T;
}

/**
 * Legacy client shape (hooks/useBookingsList.ts, BookingCalendar): `_id` and a
 * populated `staffId` object when the staff relation is included.
 */
export function serializeBooking<T extends BookingRow>(b: T) {
  const { staff, ...rest } = b;
  return {
    ...rest,
    _id: b.id,
    status: toAppBookingStatus(b.status as T['status']),
    staffId: staff && b.staffId ? { _id: b.staffId, name: staff.name, email: staff.email } : (b.staffId ?? undefined),
  };
}
