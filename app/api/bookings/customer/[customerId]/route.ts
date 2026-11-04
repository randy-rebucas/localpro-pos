import { NextRequest, NextResponse } from 'next/server';
import { getRepos, type BookingFilter, type BookingStatus } from '@/lib/db';
import { requireCustomerAuth } from '@/lib/auth-customer';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { requireBookingSchedulingAccess } from '@/lib/booking-scheduling-access';
import { logger } from '@/lib/logger';

/**
 * GET - Get all bookings for a customer
 * Query params:
 * - status: booking status (optional)
 * - startDate: ISO date string (optional)
 * - endDate: ISO date string (optional)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const t = await getValidationTranslatorFromRequest(request);
    
    // Verify customer authentication
    const customer = await requireCustomerAuth(request);
    const { customerId } = await params;

    // Ensure customer can only access their own bookings
    if (customer.customerId !== customerId) {
      return NextResponse.json(
        { success: false, error: t('validation.unauthorized', 'Unauthorized') },
        { status: 403 }
      );
    }

    try {
      await requireBookingSchedulingAccess(customer.tenantId);
    } catch (featureError: unknown) {
      const msg = featureError instanceof Error ? featureError.message : 'Forbidden';
      return NextResponse.json({ success: false, error: msg }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Build query
    const query: BookingFilter = { customerContact: { email: customer.email, phone: customer.phone } };

    // Add status filter
    if (status) {
      query.status = status as BookingStatus;
    }

    // Add date range filter
    if (startDate || endDate) {
      query.startTime = {
        ...(startDate && { gte: new Date(startDate) }),
        ...(endDate && { lte: new Date(endDate) }),
      };
    }

    // Most recent first
    const bookings = await getRepos().bookings.list(customer.tenantId, query, { populateStaff: true, sort: '-startTime' });

    return NextResponse.json({
      success: true,
      data: bookings,
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Get customer bookings error:', error);
    
    if (error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch bookings' },
      { status: 500 }
    );
  }
}
