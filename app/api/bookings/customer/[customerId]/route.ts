import { NextRequest, NextResponse } from 'next/server';
import { LIST_SAFETY_CAP } from '@/lib/query-utils';
import connectDB from '@/lib/mongodb';
import Booking from '@/models/Booking';
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
    await connectDB();
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

    // Login proves the phone number only. A customer's email is never verified, and
    // a missing value would match every booking without one.
    if (!customer.phone) {
      return NextResponse.json({ success: true, data: [], truncated: false });
    }

    // Build query
    const query: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
      tenantId: customer.tenantId,
      customerPhone: customer.phone,
    };

    // Add status filter
    if (status) {
      query.status = status;
    }

    // Add date range filter
    if (startDate || endDate) {
      query.startTime = {};
      if (startDate) {
        query.startTime.$gte = new Date(startDate);
      }
      if (endDate) {
        query.startTime.$lte = new Date(endDate);
      }
    }

    const bookings = await Booking.find(query)
      .populate('staffId', 'name email')
      .sort({ startTime: -1 }) // Most recent first
      .limit(LIST_SAFETY_CAP + 1)
      .lean();

    return NextResponse.json({
      success: true,
      data: bookings.slice(0, LIST_SAFETY_CAP),
      truncated: bookings.length > LIST_SAFETY_CAP,
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
