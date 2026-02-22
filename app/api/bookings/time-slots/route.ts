import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Booking from '@/models/Booking';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { getCurrentUser } from '@/lib/auth';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

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

    const selectedDate = new Date(dateParam);
    selectedDate.setHours(0, 0, 0, 0);

    const endDate = new Date(selectedDate);
    endDate.setHours(23, 59, 59, 999);

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
    const startTime = new Date(selectedDate);
    startTime.setHours(startHour, 0, 0, 0);

    const endTime = new Date(selectedDate);
    endTime.setHours(endHour, 0, 0, 0);

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
    console.error('Get time slots error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToFetchTimeSlots', 'Failed to fetch time slots') },
      { status: 500 }
    );
  }
}

