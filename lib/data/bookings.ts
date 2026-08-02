import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export const ACTIVE_BOOKING_STATUSES: Prisma.EnumBookingStatusFilter['in'] = ['pending', 'confirmed'];

/**
 * Replicates the old Mongoose Booking pre-save hook's staff double-booking
 * check: find any active (pending/confirmed) booking for the same staff
 * (or, if staffId is omitted, any active booking at all) whose time range
 * overlaps [startTime, endTime), optionally excluding a given booking id
 * (for updates).
 */
export async function findOverlappingBookings(params: {
  tenantId: string;
  startTime: Date;
  endTime: Date;
  staffId?: string | null;
  excludeId?: string;
}) {
  const { tenantId, startTime, endTime, staffId, excludeId } = params;
  return prisma.booking.findMany({
    where: {
      tenantId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      status: { in: ['pending', 'confirmed'] },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
      ...(staffId ? { staffId } : {}),
    },
  });
}

export function bookingToApi(booking: any) {
  const { id, staff, ...rest } = booking;
  return {
    _id: id,
    ...rest,
    ...(staff !== undefined
      ? { staffId: staff ? { _id: staff.id, name: staff.name, email: staff.email } : rest.staffId }
      : {}),
  };
}
