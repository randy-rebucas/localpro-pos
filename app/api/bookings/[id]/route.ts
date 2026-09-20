import { NextRequest, NextResponse } from 'next/server';
import prisma, { dbTransaction } from '@/lib/db';
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

// Prisma's BookingStatus enum stores `no_show` (mapped to the db value
// 'no-show'); the rest of the app (lib/bookings-helpers.ts, UI) uses the
// hyphenated literal 'no-show'. Normalize at the boundary.
function toAppStatus(status: string): BookingStatus {
  return (status === 'no_show' ? 'no-show' : status) as BookingStatus;
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
    const booking = await prisma.booking.findFirst({
      where: { id, tenantId },
      include: { staff: { select: { name: true, email: true } } },
    });

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
    const existingBooking = await prisma.booking.findFirst({ where: { id, tenantId } });

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

    if (status !== undefined && !isValidBookingStatusTransition(toAppStatus(oldStatus), status)) {
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
      const staff = await prisma.user.findFirst({ where: { id: staffId, tenantId, isActive: true } });
      if (!staff) {
        return NextResponse.json(
          { success: false, error: t('validation.staffNotFound', 'Staff member not found or inactive') },
          { status: 404 }
        );
      }
    }

    // Build the update and apply it inside a transaction so the overlap
    // conflict check and the write happen back-to-back on the same snapshot.
    // The original Mongoose model's pre('save') hook re-checked staff overlap
    // immediately before every .save() commit; there's no equivalent
    // model-level hook in Postgres, so the same re-check is made explicit
    // here, inside prisma.$transaction, right before the update.
    const updateData: Record<string, unknown> = {};
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

    let updatedBooking;
    try {
      await dbTransaction(async (tx) => {
        if (startTime || duration) {
          const conflictingBookings = await tx.booking.findMany({
            where: {
              tenantId,
              id: { not: id },
              status: { in: ['pending', 'confirmed'] },
              startTime: { lt: newEndTime },
              endTime: { gt: newStartTime },
            },
          });

          const checkStaffId = staffId || existingBooking.staffId;
          if (checkStaffId) {
            const staffConflicts = conflictingBookings.filter(
              (booking) => booking.staffId === checkStaffId
            );
            if (staffConflicts.length > 0) {
              throw new BookingConflictError(
                t('validation.staffBookingConflict', 'Staff member already has a booking at this time'),
                staffConflicts
              );
            }
          }
        }

        await tx.booking.update({ where: { id }, data: updateData });
      });

      updatedBooking = await prisma.booking.findUnique({
        where: { id },
        include: { staff: { select: { name: true, email: true } } },
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

    // Send notifications based on status changes
    if (status && status !== oldStatus) {
      try {
        const tenantSettings = await getTenantSettingsById(tenantId);
        if (status === 'confirmed' && !existingBooking.confirmationSent) {
          await sendBookingConfirmation({
            customerName: updatedBooking!.customerName,
            customerEmail: updatedBooking!.customerEmail ?? undefined,
            customerPhone: updatedBooking!.customerPhone ?? undefined,
            serviceName: updatedBooking!.serviceName,
            startTime: updatedBooking!.startTime,
            endTime: updatedBooking!.endTime,
            staffName: updatedBooking!.staffName ?? undefined,
            notes: updatedBooking!.notes ?? undefined,
            bookingId: id,
          }, tenantSettings || undefined);
          await prisma.booking.update({ where: { id }, data: { confirmationSent: true } });
        } else if (status === 'cancelled') {
          await sendBookingCancellation({
            customerName: updatedBooking!.customerName,
            customerEmail: updatedBooking!.customerEmail ?? undefined,
            customerPhone: updatedBooking!.customerPhone ?? undefined,
            serviceName: updatedBooking!.serviceName,
            startTime: oldStartTime,
            endTime: existingBooking.endTime,
            staffName: existingBooking.staffName ?? undefined,
            notes: existingBooking.notes ?? undefined,
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
    const booking = await prisma.booking.findFirst({ where: { id, tenantId } });

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
          customerEmail: booking.customerEmail ?? undefined,
          customerPhone: booking.customerPhone ?? undefined,
          serviceName: booking.serviceName,
          startTime: booking.startTime,
          endTime: booking.endTime,
          staffName: booking.staffName ?? undefined,
          notes: booking.notes ?? undefined,
          bookingId: id,
        });
      } catch (notificationError) {
        logger.error('Failed to send cancellation notification:', notificationError);
      }
    }

    await prisma.booking.update({
      where: { id },
      data: { isActive: false, status: 'cancelled' },
    });

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
