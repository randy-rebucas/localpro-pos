import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { validateEmail } from '@/lib/validation'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

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

    // Resolve tenant (accept slug or id)
    const tenant = await prisma.tenant.findFirst({
      where: {
        OR: [{ slug: tenantId }, { id: tenantId }],
        isActive: true,
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

    // Create inside a transaction with an app-level overlap re-check so the
    // conflict read and the insert share one snapshot (the original Mongoose
    // model's pre('save') hook re-checked overlap immediately before every
    // write; Postgres doesn't have that model-level hook, so we replicate
    // the same guarantee explicitly here).
    let booking;
    try {
      booking = await prisma.$transaction(async (tx) => {
        const conflict = await tx.booking.findFirst({
          where: {
            tenantId: tenant.id,
            status: { in: ['pending', 'confirmed'] },
            startTime: { lt: bookingEndTime },
            endTime: { gt: bookingStartTime },
            ...(staffId ? { staffId } : {}),
          },
        });

        if (conflict) {
          throw new Error('TIME_SLOT_CONFLICT');
        }

        return tx.booking.create({
          data: {
            id: randomUUID(),
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
      });
    } catch (txError) {
      if (txError instanceof Error && txError.message === 'TIME_SLOT_CONFLICT') {
        return NextResponse.json(
          { success: false, error: t('validation.timeSlotConflict', 'This time slot is not available') },
          { status: 409 }
        );
      }
      throw txError;
    }

    await createAuditLog(request, {
      tenantId: tenant.id,
      userId: currentUser.userId,
      action: AuditActions.CREATE,
      entityType: 'booking',
      entityId: booking.id,
      metadata: { source: 'client', userId: currentUser.userId },
    });

    return NextResponse.json({ success: true, data: booking }, { status: 201 });
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
    const tenant = await prisma.tenant.findFirst({
      where: {
        OR: [{ slug: tenantIdParam }, { id: tenantIdParam }],
        isActive: true,
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

    const bookings = await prisma.booking.findMany({
      where: {
        tenantId: tenant.id,
        customerEmail: user.email,
        ...(status ? { status: status as never } : {}),
      },
      orderBy: { startTime: 'desc' },
    });

    return NextResponse.json({ success: true, data: bookings });
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
