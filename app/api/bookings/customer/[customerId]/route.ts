import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireCustomerAuth } from '@/lib/auth-customer';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { requireBookingSchedulingAccess } from '@/lib/booking-scheduling-access';
import { logger } from '@/lib/logger';
import { bookingToApi } from '@/lib/data/bookings';
import type { Prisma } from '@prisma/client';

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
    const where: Prisma.BookingWhereInput = {
      tenantId: customer.tenantId,
      OR: [
        { customerEmail: customer.email },
        { customerPhone: customer.phone },
      ],
    };

    // Add status filter
    if (status) {
      where.status = status as Prisma.EnumBookingStatusFilter['equals'];
    }

    // Add date range filter
    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) {
        (where.startTime as Prisma.DateTimeFilter).gte = new Date(startDate);
      }
      if (endDate) {
        (where.startTime as Prisma.DateTimeFilter).lte = new Date(endDate);
      }
    }

    const bookings = await prisma.booking.findMany({
      where,
      include: { staff: { select: { id: true, name: true, email: true } } },
      orderBy: { startTime: 'desc' }, // Most recent first
    });

    return NextResponse.json({
      success: true,
      data: bookings.map(bookingToApi),
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
