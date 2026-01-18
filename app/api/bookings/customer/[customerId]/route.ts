import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Booking from '@/models/Booking';
import { requireCustomerAuth } from '@/lib/auth-customer';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

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

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Build query
    const query: Record<string, unknown> = { tenantId: customer.tenantId,
      $or: [
        { customerEmail: customer.email },
        { customerPhone: customer.phone },
      ],
    };

    // Add status filter
    if (status) {
      query.status = status;
    }

    // Add date range filter
    if (startDate || endDate) {
      const timeFilter: { $gte?: Date; $lte?: Date } = {};
      if (startDate) {
        timeFilter.$gte = new Date(startDate);
      }
      if (endDate) {
        timeFilter.$lte = new Date(endDate);
      }
      query.startTime = timeFilter;
    }

    const bookings = await Booking.find(query)
      .populate('staffId', 'name email')
      .sort({ startTime: -1 }) // Most recent first
      .lean();

    return NextResponse.json({
      success: true,
      data: bookings,
    });
  } catch (error: unknown) {
    console.error('Get customer bookings error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch bookings';
    if (errorMessage === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: errorMessage }, 
      { status: 500 }
    );
  }
}
