import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { getClosedHolidayForDate } from '@/lib/holidays';

/**
 * GET /api/booking/availability?tenantId={{tenantId}}&serviceId={{serviceId}}&date={{date}}
 * Public endpoint to check available time slots for a service on a given date.
 */
export async function GET(request: NextRequest) {
  let t: (key: string, fallback: string) => string;
  try {
    t = await getValidationTranslatorFromRequest(request);

    const { searchParams } = request.nextUrl;
    const tenantIdParam = searchParams.get('tenantId');
    const serviceId = searchParams.get('serviceId');
    const dateParam = searchParams.get('date');

    if (!tenantIdParam || !serviceId || !dateParam) {
      return NextResponse.json(
        { success: false, error: t('validation.missingParams', 'tenantId, serviceId, and date are required') },
        { status: 400 }
      );
    }

    // Resolve tenant
    const tenant = await prisma.tenant.findFirst({
      where: {
        OR: [{ slug: tenantIdParam }, { id: tenantIdParam }],
        isActive: true,
      },
      include: { settings: true },
    });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found or inactive') },
        { status: 404 }
      );
    }

    // Fetch service to get default duration
    const service = await prisma.product.findFirst({
      where: {
        id: serviceId,
        tenantId: tenant.id,
        productType: 'service',
      },
    });

    if (!service) {
      return NextResponse.json(
        { success: false, error: t('validation.serviceNotFound', 'Service not found') },
        { status: 404 }
      );
    }

    const staffId = searchParams.get('staffId');
    const duration = parseInt(searchParams.get('duration') || '60', 10);
    const slotInterval = parseInt(searchParams.get('slotInterval') || '30', 10);
    const startHour = parseInt(searchParams.get('startHour') || '9', 10);
    const endHour = parseInt(searchParams.get('endHour') || '17', 10);

    // Get the selected date boundaries
    const selectedDate = new Date(dateParam);
    selectedDate.setHours(0, 0, 0, 0);
    const endDate = new Date(selectedDate);
    endDate.setHours(23, 59, 59, 999);

    // Fetch existing bookings for this date
    const existingBookings = await prisma.booking.findMany({
      where: {
        tenantId: tenant.id,
        startTime: { gte: selectedDate, lte: endDate },
        status: { in: ['pending', 'confirmed'] },
        ...(staffId ? { staffId } : {}),
      },
    });

    // Days the tenant has marked the business closed (Admin → Holidays) have no
    // available slots — mirrors the same check enforced at booking creation/reschedule time.
    const closedHoliday = getClosedHolidayForDate((tenant.settings as unknown as { holidays?: never })?.holidays, selectedDate);

    // Generate time slots
    const slots: Array<{ time: string; available: boolean }> = [];
    const slotStart = new Date(selectedDate);
    slotStart.setHours(startHour, 0, 0, 0);

    const dayEnd = new Date(selectedDate);
    dayEnd.setHours(endHour, 0, 0, 0);

    let currentSlot = new Date(slotStart);

    while (currentSlot < dayEnd) {
      const slotEnd = new Date(currentSlot.getTime() + duration * 60000);

      // Check for conflicts with existing bookings
      const hasConflict = existingBookings.some((booking) => {
        const bookingStart = new Date(booking.startTime);
        const bookingEnd = new Date(booking.endTime);
        return (
          (currentSlot >= bookingStart && currentSlot < bookingEnd) ||
          (slotEnd > bookingStart && slotEnd <= bookingEnd) ||
          (currentSlot <= bookingStart && slotEnd >= bookingEnd)
        );
      });

      // Don't show past slots for today
      const isPast = currentSlot < new Date();

      slots.push({
        time: currentSlot.toISOString(),
        available: !hasConflict && !isPast && !closedHoliday,
      });

      currentSlot = new Date(currentSlot.getTime() + slotInterval * 60000);
    }

    return NextResponse.json({
      success: true,
      data: {
        service: { _id: service.id, name: service.name, price: service.price },
        date: selectedDate.toISOString(),
        slots,
        duration,
        slotInterval,
        closedHoliday: closedHoliday ? { name: closedHoliday.name } : null,
      },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch availability' },
      { status: 500 }
    );
  }
}
