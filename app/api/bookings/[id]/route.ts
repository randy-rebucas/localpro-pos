import { NextRequest, NextResponse } from 'next/server';
import { getRepos, runInTransaction, type BookingFields, type BookingWithStaff, type Patch } from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { sendBookingConfirmation, sendBookingCancellation, sendBookingReminder } from '@/lib/notifications'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { getTenantSettingsById } from '@/lib/tenant';
import { requireBookingSchedulingAccess } from '@/lib/booking-scheduling-access';
import { getClosedHolidayForDate } from '@/lib/holidays';
import { isValidBookingStatusTransition, type BookingStatus } from '@/lib/bookings-helpers';
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
 * GET - Get a single booking by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    const { id } = await params;
    const booking = await getRepos().bookings.findById(tenantId, id, { populateStaff: true });

    if (!booking) {
      return NextResponse.json(
        { success: false, error: t('validation.bookingNotFound', 'Booking not found') },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: booking });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Get booking error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToFetchBooking', 'Failed to fetch booking') },
      { status: 500 }
    );
  }
}

/**
 * PUT - Update a booking
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    if (!(await hasTenantPermission(user.role, tenantId, 'bookings.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    try {
      await requireBookingSchedulingAccess(tenantId.toString());
    } catch (featureError: unknown) {
      const msg = featureError instanceof Error ? featureError.message : 'Forbidden';
      return NextResponse.json({ success: false, error: msg }, { status: 403 });
    }

    const { id } = await params;
    const { bookings } = getRepos();
    const existingBooking = await bookings.findById(tenantId, id);

    if (!existingBooking) {
      return NextResponse.json(
        { success: false, error: t('validation.bookingNotFound', 'Booking not found') },
        { status: 404 }
      );
    }

    const body = await request.json();
    const {
      customerName,
      customerEmail,
      customerPhone,
      serviceName,
      serviceDescription,
      startTime,
      duration,
      staffId,
      notes,
      status,
    } = body;

    const oldStatus = existingBooking.status;
    const oldStartTime = existingBooking.startTime;

    if (status !== undefined && !isValidBookingStatusTransition(oldStatus as BookingStatus, status)) {
      return NextResponse.json(
        {
          success: false,
          error: t('validation.invalidBookingStatusTransition', 'Cannot change booking status from {from} to {to}')
            .replace('{from}', oldStatus)
            .replace('{to}', status),
        },
        { status: 400 }
      );
    }

    // Calculate new end time if start time or duration changed
    let newStartTime = existingBooking.startTime;
    let newEndTime = existingBooking.endTime;
    let newDuration = existingBooking.duration;

    if (startTime) {
      newStartTime = new Date(startTime);
    }
    if (duration) {
      newDuration = duration;
    }
    if (startTime || duration) {
      newEndTime = new Date(newStartTime.getTime() + newDuration * 60000);
    }

    // Block rescheduling onto a day the tenant has marked the business closed
    if (startTime) {
      const holidaySettings = await getTenantSettingsById(tenantId);
      const closedHoliday = getClosedHolidayForDate(holidaySettings?.holidays, newStartTime);
      if (closedHoliday) {
        return NextResponse.json(
          {
            success: false,
            error: t('validation.businessClosedForHoliday', 'Business is closed on this date ({holiday})').replace('{holiday}', closedHoliday.name),
          },
          { status: 409 }
        );
      }
    }

    // Verify staff exists if provided
    if (staffId) {
      const staff = await getRepos().users.findInTenant(tenantId, staffId, { activeOnly: true });
      if (!staff) {
        return NextResponse.json(
          { success: false, error: t('validation.staffNotFound', 'Staff member not found or inactive') },
          { status: 404 }
        );
      }
    }

    // Build the update and apply it inside a transaction so the conflict
    // check and the write happen back-to-back. bookings.update() re-checks
    // staff overlap immediately before the write commits, which is what stops
    // concurrent reschedules from double-booking the same staff member.
    const updateData: Patch<BookingFields> = {};
    if (customerName !== undefined) updateData.customerName = customerName;
    if (customerEmail !== undefined) updateData.customerEmail = customerEmail;
    if (customerPhone !== undefined) updateData.customerPhone = customerPhone;
    if (serviceName !== undefined) updateData.serviceName = serviceName;
    if (serviceDescription !== undefined) updateData.serviceDescription = serviceDescription;
    if (startTime !== undefined) updateData.startTime = newStartTime;
    if (duration !== undefined) updateData.duration = newDuration;
    if (startTime !== undefined || duration !== undefined) updateData.endTime = newEndTime;
    if (staffId !== undefined) updateData.staffId = staffId;
    if (notes !== undefined) updateData.notes = notes;
    if (status !== undefined) updateData.status = status;

    let updatedBooking: BookingWithStaff | null;
    try {
      await runInTransaction(async (tx) => {
        if (startTime || duration) {
          const conflictingBookings = await bookings.list(
            tenantId,
            {
              excludeId: id,
              status: ['pending', 'confirmed'],
              overlaps: { start: newStartTime, end: newEndTime },
            },
            { tx }
          );

          const checkStaffId = staffId || existingBooking.staffId;
          if (checkStaffId) {
            const staffConflicts = conflictingBookings.filter((booking) => booking.staffId === String(checkStaffId));
            if (staffConflicts.length > 0) {
              throw new BookingConflictError(
                t('validation.staffBookingConflict', 'Staff member already has a booking at this time'),
                staffConflicts
              );
            }
          }
        }

        // Re-checks staff overlap too, in this same transaction
        await bookings.update(tenantId, id, updateData, { tx });
      });

      updatedBooking = await bookings.findById(tenantId, id, { populateStaff: true });
    } catch (txError) {
      if (txError instanceof BookingConflictError) {
        return NextResponse.json(
          { success: false, error: txError.message, conflicts: txError.conflicts },
          { status: 409 }
        );
      }
      throw txError;
    }

    // Send notifications based on status changes
    if (status && status !== oldStatus) {
      try {
        const tenantSettings = await getTenantSettingsById(tenantId);
        if (status === 'confirmed' && !existingBooking.confirmationSent) {
          await sendBookingConfirmation({
            customerName: updatedBooking!.customerName,
            customerEmail: updatedBooking!.customerEmail,
            customerPhone: updatedBooking!.customerPhone,
            serviceName: updatedBooking!.serviceName,
            startTime: updatedBooking!.startTime,
            endTime: updatedBooking!.endTime,
            staffName: updatedBooking!.staffName,
            notes: updatedBooking!.notes,
            bookingId: id,
          }, tenantSettings || undefined);
          await bookings.updateMany(tenantId, { ids: [id] }, { confirmationSent: true });
        } else if (status === 'cancelled') {
          await sendBookingCancellation({
            customerName: updatedBooking!.customerName,
            customerEmail: updatedBooking!.customerEmail,
            customerPhone: updatedBooking!.customerPhone,
            serviceName: updatedBooking!.serviceName,
            startTime: oldStartTime,
            endTime: existingBooking.endTime,
            staffName: existingBooking.staffName,
            notes: existingBooking.notes,
            bookingId: id,
          }, tenantSettings || undefined);
        }
      } catch (notificationError) {
        logger.error('Failed to send booking notification:', notificationError);
        // Don't fail the update if notification fails
      }
    }

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'booking',
      entityId: id,
      changes: updateData,
    });

    return NextResponse.json({ success: true, data: updatedBooking });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Update booking error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToUpdateBooking', 'Failed to update booking') },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Cancel/delete a booking
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    if (!(await hasTenantPermission(user.role, tenantId, 'bookings.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const { id } = await params;
    const { bookings } = getRepos();
    const booking = await bookings.findById(tenantId, id);

    if (!booking) {
      return NextResponse.json(
        { success: false, error: t('validation.bookingNotFound', 'Booking not found') },
        { status: 404 }
      );
    }

    // Send cancellation notification if booking was confirmed
    if (booking.status === 'confirmed' || booking.status === 'pending') {
      try {
        await sendBookingCancellation({
          customerName: booking.customerName,
          customerEmail: booking.customerEmail,
          customerPhone: booking.customerPhone,
          serviceName: booking.serviceName,
          startTime: booking.startTime,
          endTime: booking.endTime,
          staffName: booking.staffName,
          notes: booking.notes,
          bookingId: id,
        });
      } catch (notificationError) {
        logger.error('Failed to send cancellation notification:', notificationError);
      }
    }

    await bookings.update(tenantId, id, { isActive: false, status: 'cancelled' });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.DELETE,
      entityType: 'booking',
      entityId: id,
      changes: { customerName: booking.customerName, serviceName: booking.serviceName, softDeleted: true },
    });

    return NextResponse.json({ success: true, message: t('validation.bookingDeleted', 'Booking deleted successfully') });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Delete booking error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToDeleteBooking', 'Failed to delete booking') },
      { status: 500 }
    );
  }
}

