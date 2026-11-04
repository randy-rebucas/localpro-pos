import { NextRequest, NextResponse } from 'next/server';
import { getRepos, runInTransaction, type Booking, type BookingFilter, type BookingStatus } from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth, getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { sendBookingConfirmation } from '@/lib/notifications';
import { getTenantSettingsById } from '@/lib/tenant';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { requireBookingSchedulingAccess } from '@/lib/booking-scheduling-access';
import { getClosedHolidayForDate } from '@/lib/holidays';
import { logger } from '@/lib/logger';

class BookingConflictError extends Error {
  conflicts: unknown;
  constructor(message: string, conflicts: unknown) {
    super(message);
    this.name = 'BookingConflictError';
    this.conflicts = conflicts;
  }
}

/**
 * GET - Get all bookings for a tenant
 * Query params:
 * - startDate: ISO date string (optional)
 * - endDate: ISO date string (optional)
 * - status: booking status (optional)
 * - staffId: filter by staff member (optional)
 */
export async function GET(request: NextRequest) {
  try {
    let user;
    const t = await getValidationTranslatorFromRequest(request);
    try {
      user = await requireAuth(request);
    } catch {
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

    if (!(await hasTenantPermission(user.role, tenantId, 'bookings.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const status = searchParams.get('status');
    const staffId = searchParams.get('staffId');

    // Build query
    const query: BookingFilter = { notDisabled: true };

    if (startDate || endDate) {
      query.startTime = {
        ...(startDate && { gte: new Date(startDate) }),
        ...(endDate && { lte: new Date(endDate) }),
      };
    }

    if (status) {
      query.status = status as BookingStatus;
    }

    if (staffId) {
      query.staffId = staffId;
    }

    const bookings = await getRepos().bookings.list(tenantId, query, { populateStaff: true, sort: 'startTime' });

    return NextResponse.json({ success: true, data: bookings });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Get bookings error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToFetchBookings', 'Failed to fetch bookings') },
      { status: 500 }
    );
  }
}

/**
 * POST - Create a new booking
 */
export async function POST(request: NextRequest) {
  try {
    const t = await getValidationTranslatorFromRequest(request);
    
    // Allow cashiers and above OR authenticated customers to create bookings
    let tenantId: string | null = null;
    let isCustomer = false;
    let customerAuth: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
    
    try {
      // Try customer authentication first
      const { requireCustomerAuth } = await import('@/lib/auth-customer');
      customerAuth = await requireCustomerAuth(request);
      tenantId = customerAuth.tenantId;
      isCustomer = true;
    } catch {
      // Fall back to staff authentication
      const user = await getCurrentUser(request);
      if (!user) {
        return NextResponse.json(
          { success: false, error: t('validation.unauthorized', 'Unauthorized') },
          { status: 401 }
        );
      }
      if (!(await hasTenantPermission(user.role, user.tenantId, 'bookings.manage'))) {
        return NextResponse.json(
          { success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') },
          { status: 403 }
        );
      }
      tenantId = await getTenantIdFromRequest(request);
    }
    
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:bookings:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    try {
      await requireBookingSchedulingAccess(tenantId.toString());
    } catch (featureError: unknown) {
      const msg = featureError instanceof Error ? featureError.message : 'Forbidden';
      return NextResponse.json({ success: false, error: msg }, { status: 403 });
    }

    const body = await request.json();
    const {
      serviceName,
      serviceDescription,
      startTime,
      duration,
      staffId,
      notes,
      status = 'pending',
    } = body;
    let {
      customerName,
      customerEmail,
      customerPhone,
    } = body;

    // If customer is authenticated, use their information
    if (isCustomer && customerAuth) {
      const customer = await getRepos().customers.findById(customerAuth.tenantId, customerAuth.customerId);

      if (customer) {
        customerName = customerName || `${customer.firstName} ${customer.lastName}`;
        customerEmail = customerEmail || customer.email;
        customerPhone = customerPhone || customer.phone;
      }
    }

    // Validation
    if (!customerName || !serviceName || !startTime || !duration) {
      return NextResponse.json(
        { success: false, error: t('validation.bookingFieldsRequired', 'Customer name, service name, start time, and duration are required') },
        { status: 400 }
      );
    }

    const start = new Date(startTime);
    const end = new Date(start.getTime() + duration * 60000);

    // Block bookings on days the tenant has marked the business closed
    // (Admin → Holidays) — this is the whole point of that calendar.
    const holidaySettings = await getTenantSettingsById(tenantId);
    const closedHoliday = getClosedHolidayForDate(holidaySettings?.holidays, start);
    if (closedHoliday) {
      return NextResponse.json(
        {
          success: false,
          error: t('validation.businessClosedForHoliday', 'Business is closed on this date ({holiday})').replace('{holiday}', closedHoliday.name),
        },
        { status: 409 }
      );
    }

    // Verify staff exists if provided (only for staff-created bookings, not customer bookings)
    if (staffId && !isCustomer) {
      const staff = await getRepos().users.findInTenant(tenantId, staffId, { activeOnly: true });
      if (!staff) {
        return NextResponse.json(
          { success: false, error: t('validation.staffNotFound', 'Staff member not found or inactive') },
          { status: 404 }
        );
      }
    }

    // Check for conflicts and create inside a transaction so the read (conflict
    // check) and the write (create, which also re-checks staff overlap in the
    // model's pre('save') hook) share one snapshot — a plain read-then-create
    // would let two concurrent bookings both pass the conflict check before
    // either insert commits, double-booking the same staff/slot.
    const { bookings } = getRepos();
    let booking: Booking;
    try {
      booking = await runInTransaction(async (tx) => {
        const conflictingBookings = await bookings.list(
          tenantId,
          { status: ['pending', 'confirmed'], overlaps: { start, end } },
          { tx }
        );

        if (staffId) {
          const staffConflicts = conflictingBookings.filter((b) => b.staffId === staffId);
          if (staffConflicts.length > 0) {
            throw new BookingConflictError(
              t('validation.staffBookingConflict', 'Staff member already has a booking at this time'),
              staffConflicts
            );
          }
        } else if (conflictingBookings.length > 0) {
          throw new BookingConflictError(
            t('validation.timeSlotBooked', 'Time slot is already booked'),
            conflictingBookings
          );
        }

        return bookings.create(tenantId, {
          customerName,
          customerEmail,
          customerPhone,
          serviceName,
          serviceDescription,
          startTime: start,
          endTime: end,
          duration,
          staffId,
          notes,
          status,
        }, { tx });
      });
    } catch (txError) {
      if (txError instanceof BookingConflictError) {
        return NextResponse.json(
          { success: false, error: txError.message, conflicts: txError.conflicts },
          { status: 409 }
        );
      }
      throw txError;
    }

    // Send confirmation if status is confirmed and contact info is provided
    if (status === 'confirmed' && (customerEmail || customerPhone)) {
      try {
        const tenantSettings = holidaySettings;
        await sendBookingConfirmation({
          customerName,
          customerEmail,
          customerPhone,
          serviceName,
          startTime: start,
          endTime: end,
          staffName: booking.staffName,
          notes,
          bookingId: booking._id,
        }, tenantSettings || undefined);
        await bookings.updateMany(tenantId, { ids: [booking._id] }, { confirmationSent: true });
      } catch (notificationError) {
        logger.error('Failed to send booking confirmation:', notificationError);
        // Don't fail the booking creation if notification fails
      }
    }

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'booking',
      entityId: booking._id.toString(),
      changes: {
        customerName,
        serviceName,
        startTime: start.toISOString(),
        status,
      },
    });

    const bookingData = await bookings.findById(tenantId, booking._id, { populateStaff: true });

    return NextResponse.json(
      { success: true, data: bookingData },
      { status: 201 }
    );
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Create booking error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, error: t('validation.bookingExists', 'Booking already exists') },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToCreateBooking', 'Failed to create booking') },
      { status: 500 }
    );
  }
}

