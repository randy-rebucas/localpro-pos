import type { Prisma } from '@prisma/client';

type AttendanceRow = {
  id: string;
  userId: string;
  totalHours: Prisma.Decimal | null;
  locationLatitude: Prisma.Decimal | null;
  locationLongitude: Prisma.Decimal | null;
  locationAddress: string | null;
  user?: { name: string; email: string } | null;
  [key: string]: unknown;
};

/**
 * Legacy client shape (hooks/useAttendance.ts, AttendanceTrendsCharts): `_id`,
 * a populated `userId` object when the user relation is included, numeric
 * `totalHours`, and a nested `location`.
 */
export function serializeAttendance(a: AttendanceRow) {
  const { user, locationLatitude, locationLongitude, locationAddress, ...rest } = a;
  const hasLocation = locationLatitude != null || locationLongitude != null || locationAddress != null;
  return {
    ...rest,
    _id: a.id,
    userId: user ? { _id: a.userId, name: user.name, email: user.email } : a.userId,
    totalHours: a.totalHours != null ? Number(a.totalHours) : undefined,
    location: hasLocation
      ? {
          latitude: locationLatitude != null ? Number(locationLatitude) : undefined,
          longitude: locationLongitude != null ? Number(locationLongitude) : undefined,
          address: locationAddress ?? undefined,
        }
      : undefined,
  };
}
