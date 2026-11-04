import { NextRequest, NextResponse } from 'next/server';
import { getRepos, type BookingFilter, type BookingStatus } from '@/lib/db';
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

    // Resolve tenant
    const { tenants, users } = getRepos();
    const tenant = await tenants.findActiveBySlugOrId(tenantId);

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found or inactive') },
        { status: 404 }
      );
    }

    // Get user details for customer info
    const user = await users.findById(currentUser.userId);
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
    const conflictQuery: BookingFilter = {
      status: ['pending', 'confirmed'],
      overlaps: { start: bookingStartTime, end: bookingEndTime },
    };

    if (staffId) {
      conflictQuery.staffId = staffId;
    }

    const { bookings: bookingRepo } = getRepos();
    const conflict = await bookingRepo.findOne(tenant._id, conflictQuery);
    if (conflict) {
      return NextResponse.json(
        { success: false, error: t('validation.timeSlotConflict', 'This time slot is not available') },
        { status: 409 }
      );
    }

    const booking = await bookingRepo.create(tenant._id, {
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
    });

    await createAuditLog(request, {
      tenantId: tenant._id,
      userId: currentUser.userId,
      action: AuditActions.CREATE,
      entityType: 'booking',
      entityId: booking._id.toString(),
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
    const { tenants, users } = getRepos();
    const tenant = await tenants.findActiveBySlugOrId(tenantIdParam);

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found or inactive') },
        { status: 404 }
      );
    }

    // Get user email to match bookings
    const user = await users.findById(userId);
    if (!user) {
      return NextResponse.json(
        { success: false, error: t('validation.userNotFound', 'User not found') },
        { status: 404 }
      );
    }

    const status = searchParams.get('status');
    const filter: BookingFilter = { customerEmail: user.email };

    if (status) {
      filter.status = status as BookingStatus;
    }

    const bookings = await getRepos().bookings.list(tenant._id, filter, { sort: '-startTime' });

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
