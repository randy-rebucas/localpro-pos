import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { validateEmail } from '@/lib/validation'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { findOverlappingBookings, bookingToApi } from '@/lib/data/bookings';
import type { Prisma } from '@prisma/client';

/**
 * POST /api/booking
 * Authenticated client endpoint to create a booking.
 * Body: { tenantId, serviceName, serviceDescription?, startTime, duration, staffId?, notes? }
 */
export async function POST(request: NextRequest) {
  let t: (key: string, fallback: string) => string;
  try {
    t = await getValidationTranslatorFromRequest(request);

    const currentUser = await requireAuth(request);
    const body = await request.json();
    const { tenantId, serviceName, serviceDescription, startTime, duration, staffId, notes } = body;

    if (!tenantId || !serviceName || !startTime || !duration) {
      return NextResponse.json(
        { success: false, error: t('validation.bookingFieldsRequired', 'tenantId, serviceName, startTime, and duration are required') },
        { status: 400 }
      );
    }

    // Resolve tenant
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId);
    const tenant = await prisma.tenant.findFirst({
      where: {
        isActive: true,
        OR: [{ slug: tenantId }, ...(isUuid ? [{ id: tenantId }] : [])],
      },
    });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found or inactive') },
        { status: 404 }
      );
    }

    // Get user details for customer info
    const user = await prisma.user.findUnique({ where: { id: currentUser.userId } });
    if (!user) {
      return NextResponse.json(
        { success: false, error: t('validation.userNotFound', 'User not found') },
        { status: 404 }
      );
    }

    const bookingStartTime = new Date(startTime);
    if (isNaN(bookingStartTime.getTime())) {
      return NextResponse.json(
        { success: false, error: t('validation.invalidStartTime', 'Invalid start time') },
        { status: 400 }
      );
    }

    // Don't allow booking in the past
    if (bookingStartTime < new Date()) {
      return NextResponse.json(
        { success: false, error: t('validation.bookingInPast', 'Cannot book a time in the past') },
        { status: 400 }
      );
    }

    const durationMinutes = parseInt(duration, 10);
    if (isNaN(durationMinutes) || durationMinutes <= 0) {
      return NextResponse.json(
        { success: false, error: t('validation.invalidDuration', 'Duration must be a positive number in minutes') },
        { status: 400 }
      );
    }

    const bookingEndTime = new Date(bookingStartTime.getTime() + durationMinutes * 60000);

    // Check for time conflicts
    const conflicts = await findOverlappingBookings({
      tenantId: tenant.id,
      startTime: bookingStartTime,
      endTime: bookingEndTime,
      staffId: staffId || undefined,
    });
    const conflict = conflicts[0];
    if (conflict) {
      return NextResponse.json(
        { success: false, error: t('validation.timeSlotConflict', 'This time slot is not available') },
        { status: 409 }
      );
    }

    const booking = await prisma.booking.create({
      data: {
        tenantId: tenant.id,
        customerName: user.name,
        customerEmail: user.email,
        serviceName,
        serviceDescription,
        startTime: bookingStartTime,
        endTime: bookingEndTime,
        duration: durationMinutes,
        staffId: staffId || undefined,
        notes,
        status: 'pending',
      },
    });

    await createAuditLog(request, {
      tenantId: tenant.id,
      userId: currentUser.userId,
      action: AuditActions.CREATE,
      entityType: 'booking',
      entityId: booking.id,
      metadata: { source: 'client', userId: currentUser.userId },
    });

    return NextResponse.json({ success: true, data: bookingToApi(booking) }, { status: 201 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create booking' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/booking?userId={{userId}}&tenantId={{tenantId}}
 * Authenticated endpoint to list a client's bookings.
 */
export async function GET(request: NextRequest) {
  let t: (key: string, fallback: string) => string;
  try {
    t = await getValidationTranslatorFromRequest(request);

    const currentUser = await requireAuth(request);
    const { searchParams } = request.nextUrl;
    const tenantIdParam = searchParams.get('tenantId');
    const userId = searchParams.get('userId');

    if (!tenantIdParam || !userId) {
      return NextResponse.json(
        { success: false, error: t('validation.missingParams', 'tenantId and userId are required') },
        { status: 400 }
      );
    }

    // Users can only view their own bookings (unless admin+)
    if (currentUser.userId !== userId && !['admin', 'owner', 'manager'].includes(currentUser.role)) {
      return NextResponse.json(
        { success: false, error: t('validation.forbidden', 'You can only view your own bookings') },
        { status: 403 }
      );
    }

    // Resolve tenant
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantIdParam);
    const tenant = await prisma.tenant.findFirst({
      where: {
        isActive: true,
        OR: [{ slug: tenantIdParam }, ...(isUuid ? [{ id: tenantIdParam }] : [])],
      },
    });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found or inactive') },
        { status: 404 }
      );
    }

    // Get user email to match bookings
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json(
        { success: false, error: t('validation.userNotFound', 'User not found') },
        { status: 404 }
      );
    }

    const status = searchParams.get('status');
    const where: Prisma.BookingWhereInput = {
      tenantId: tenant.id,
      customerEmail: user.email,
    };

    if (status) {
      where.status = status as Prisma.EnumBookingStatusFilter['equals'];
    }

    const bookings = await prisma.booking.findMany({
      where,
      orderBy: { startTime: 'desc' },
    });

    return NextResponse.json({ success: true, data: bookings.map(bookingToApi) });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch bookings' },
      { status: 500 }
    );
  }
}
