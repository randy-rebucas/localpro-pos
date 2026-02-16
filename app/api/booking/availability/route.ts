import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Booking from '@/models/Booking';
import Product from '@/models/Product';
import Tenant from '@/models/Tenant';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

/**
 * GET /api/booking/availability?tenantId={{tenantId}}&serviceId={{serviceId}}&date={{date}}
 * Public endpoint to check available time slots for a service on a given date.
 */
export async function GET(request: NextRequest) {
  let t: (key: string, fallback: string) => string;
  try {
    await connectDB();
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
    const tenant = await Tenant.findOne({
      $or: [{ slug: tenantIdParam }, ...(tenantIdParam.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: tenantIdParam }] : [])],
      isActive: true,
    }).lean();

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found or inactive') },
        { status: 404 }
      );
    }

    // Fetch service to get default duration
    const service = await Product.findOne({
      _id: serviceId,
      tenantId: tenant._id,
      productType: 'service',
    }).lean();

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
    const query: Record<string, any> = {
      tenantId: tenant._id,
      startTime: { $gte: selectedDate, $lte: endDate },
      status: { $in: ['pending', 'confirmed'] },
    };

    if (staffId) {
      query.staffId = staffId;
    }

    const existingBookings = await Booking.find(query).lean();

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
        available: !hasConflict && !isPast,
      });

      currentSlot = new Date(currentSlot.getTime() + slotInterval * 60000);
    }

    return NextResponse.json({
      success: true,
      data: {
        service: { _id: service._id, name: service.name, price: service.price },
        date: selectedDate.toISOString(),
        slots,
        duration,
        slotInterval,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch availability' },
      { status: 500 }
    );
  }
}
