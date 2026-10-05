type BookingRow = {
  id: string;
  staffId: string | null;
  staff?: { name: string; email: string } | null;
  [key: string]: unknown;
};

/**
 * Legacy client shape (hooks/useBookingsList.ts, BookingCalendar): `_id` and a
 * populated `staffId` object when the staff relation is included.
 */
export function serializeBooking<T extends BookingRow>(b: T) {
  const { staff, ...rest } = b;
  return {
    ...rest,
    _id: b.id,
    staffId: staff && b.staffId ? { _id: b.staffId, name: staff.name, email: staff.email } : (b.staffId ?? undefined),
  };
}
