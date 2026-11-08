import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { buildSlots } from '@/lib/booking-slots';
import { getTenantSettingsById } from '@/lib/tenant';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { getCurrentUser } from '@/lib/auth';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { requireBookingSchedulingAccess } from '@/lib/booking-scheduling-access';
import { logger } from '@/lib/logger';

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

    if (!dateParam) {
      return NextResponse.json(
        { success: false, error: t('validation.dateParameterRequired', 'Date parameter is required') },
        { status: 400 }
      );
    }

    // Laid out in the store's time zone, within Admin → Business Hours when set (see lib/booking-slots).
    const settings = await getTenantSettingsById(tenantId.toString());
    const { slots, dayStart, duration, slotInterval, closedByHours } = await buildSlots({
      tenantId,
      settings,
      dateParam,
      staffId,
      searchParams,
      withBookingIds: true,
    });

    return NextResponse.json({
      success: true,
      data: {
        date: dayStart.toISOString(),
        slots,
        duration,
        slotInterval,
        closed: closedByHours,
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

