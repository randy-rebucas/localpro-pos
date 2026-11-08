import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import Tenant from '@/models/Tenant';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { buildSlots } from '@/lib/booking-slots';

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
    const { slots, dayStart, duration, slotInterval, closedHoliday, closedByHours } = await buildSlots({
      tenantId: tenant._id,
      settings: tenant.settings,
      dateParam,
      staffId,
      searchParams,
      hidePast: true,
    });

    return NextResponse.json({
      success: true,
      data: {
        service: { _id: service._id, name: service.name, price: service.price },
        date: dayStart.toISOString(),
        slots,
        duration,
        slotInterval,
        closedHoliday: closedHoliday ? { name: closedHoliday.name } : null,
        // True when Admin → Business Hours has the store shut that day.
        closed: closedByHours,
      },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch availability' },
      { status: 500 }
    );
  }
}
