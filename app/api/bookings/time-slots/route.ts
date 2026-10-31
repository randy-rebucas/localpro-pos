import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Booking from '@/models/Booking';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { getCurrentUser } from '@/lib/auth';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { requireBookingSchedulingAccess } from '@/lib/booking-scheduling-access';
import { logger } from '@/lib/logger';
import { getTenantSettingsById } from '@/lib/tenant';
import { getTenantTimezone, getTenantDayBoundaries, getTenantYmd, tenantLocalTimeToUtc } from '@/lib/timezone';

/**
 * GET - Get available time slots for a given date
 * Query params:
 * - date: ISO date string (required)
 * - staffId: filter by staff member (optional)
 * - duration: duration in minutes (optional, default: 60)
 * - slotInterval: interval between slots in minutes (optional, default: 30)
 * - startHour: start hour (optional, default: 9)
 * - endHour: end hour (optional, default: 17)
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const user = await getCurrentUser(request);
    const t = await getValidationTranslatorFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: t('validation.unauthorized', 'Unauthorized') },
        { status: 401 }
      );
    }

    const tenantId = await getTenantIdFromRequest(request);
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    try {
      await requireBookingSchedulingAccess(tenantId.toString());
    } catch (featureError: unknown) {
      const msg = featureError instanceof Error ? featureError.message : 'Forbidden';
      return NextResponse.json({ success: false, error: msg }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const staffId = searchParams.get('staffId');
    const duration = parseInt(searchParams.get('duration') || '60', 10);
    const slotInterval = parseInt(searchParams.get('slotInterval') || '30', 10);
    const startHour = parseInt(searchParams.get('startHour') || '9', 10);
    const endHour = parseInt(searchParams.get('endHour') || '17', 10);

    if (!dateParam) {
      return NextResponse.json(
        { success: false, error: t('validation.dateParameterRequired', 'Date parameter is required') },
        { status: 400 }
      );
    }

    // The selected date and the startHour/endHour window are tenant-local wall-clock
    // values (default Asia/Manila), not the server's (Vercel runs UTC). A bare
    // 'YYYY-MM-DD' is used as the tenant calendar day directly; anything else is
    // parsed as an instant and mapped to its tenant-local day.
    const tz = getTenantTimezone(await getTenantSettingsById(tenantId.toString()));
    const selectedYmd = /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : getTenantYmd(new Date(dateParam), tz);
    const { start: selectedDate, end: endDate } = getTenantDayBoundaries(selectedYmd, tz);

    // Get existing bookings for the date
    const query: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
      tenantId,
      startTime: { $gte: selectedDate, $lte: endDate },
      status: { $in: ['pending', 'confirmed'] },
    };

    if (staffId) {
      query.staffId = staffId;
    }

    const existingBookings = await Booking.find(query).lean();

    // Generate time slots
    const slots: Array<{ time: string; available: boolean; bookingId?: string }> = [];
    const startTime = tenantLocalTimeToUtc(selectedYmd, `${startHour}:00`, tz);
    const endTime = tenantLocalTimeToUtc(selectedYmd, `${endHour}:00`, tz);

    let currentSlot = new Date(startTime);

    while (currentSlot < endTime) {
      const slotEnd = new Date(currentSlot.getTime() + duration * 60000);
      
      // Check if slot conflicts with existing bookings
      const conflict = existingBookings.find((booking) => {
        const bookingStart = new Date(booking.startTime);
        const bookingEnd = new Date(booking.endTime);
        return (
          (currentSlot >= bookingStart && currentSlot < bookingEnd) ||
          (slotEnd > bookingStart && slotEnd <= bookingEnd) ||
          (currentSlot <= bookingStart && slotEnd >= bookingEnd)
        );
      });

      slots.push({
        time: currentSlot.toISOString(),
        available: !conflict,
        bookingId: conflict?._id.toString(),
      });

      currentSlot = new Date(currentSlot.getTime() + slotInterval * 60000);
    }

    return NextResponse.json({
      success: true,
      data: {
        date: selectedDate.toISOString(),
        slots,
        duration,
        slotInterval,
      },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Get time slots error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToFetchTimeSlots', 'Failed to fetch time slots') },
      { status: 500 }
    );
  }
}

