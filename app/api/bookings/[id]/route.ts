import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { sendBookingConfirmation, sendBookingCancellation, sendBookingReminder } from '@/lib/notifications'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { getTenantSettingsById } from '@/lib/tenant';
import { requireBookingSchedulingAccess } from '@/lib/booking-scheduling-access';
import { getClosedHolidayForDate } from '@/lib/holidays';
import { logger } from '@/lib/logger';
import { findOverlappingBookings, bookingToApi } from '@/lib/data/bookings';

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
      include: { staff: { select: { id: true, name: true, email: true } } },
    });

    if (!booking) {
      return NextResponse.json(
        { success: false, error: t('validation.bookingNotFound', 'Booking not found') },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: bookingToApi(booking) });
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
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
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

    // Check for conflicts if time changed
    if (startTime || duration) {
      const checkStaffId = staffId || existingBooking.staffId;
      if (checkStaffId) {
        const staffConflicts = await findOverlappingBookings({
          tenantId,
          startTime: newStartTime,
          endTime: newEndTime,
          staffId: checkStaffId,
          excludeId: id,
        });
        if (staffConflicts.length > 0) {
          return NextResponse.json(
            {
              success: false,
              error: t('validation.staffBookingConflict', 'Staff member already has a booking at this time'),
              conflicts: staffConflicts.map(bookingToApi),
            },
            { status: 409 }
          );
        }
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

    // Update booking
    const updateData: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
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

    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: updateData,
      include: { staff: { select: { id: true, name: true, email: true } } },
    });

    // Send notifications based on status changes
    if (status && status !== oldStatus) {
      try {
        const tenantSettings = await getTenantSettingsById(tenantId);
        if (status === 'confirmed' && !existingBooking.confirmationSent) {
          await sendBookingConfirmation({
            customerName: updatedBooking.customerName,
            customerEmail: updatedBooking.customerEmail ?? undefined,
            customerPhone: updatedBooking.customerPhone ?? undefined,
            serviceName: updatedBooking.serviceName,
            startTime: updatedBooking.startTime,
            endTime: updatedBooking.endTime,
            staffName: updatedBooking.staffName ?? undefined,
            notes: updatedBooking.notes ?? undefined,
            bookingId: id,
          }, tenantSettings || undefined);
          await prisma.booking.update({ where: { id }, data: { confirmationSent: true } });
        } else if (status === 'cancelled') {
          await sendBookingCancellation({
            customerName: updatedBooking.customerName,
            customerEmail: updatedBooking.customerEmail ?? undefined,
            customerPhone: updatedBooking.customerPhone ?? undefined,
            serviceName: updatedBooking.serviceName,
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

    return NextResponse.json({ success: true, data: bookingToApi(updatedBooking) });
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
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
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
