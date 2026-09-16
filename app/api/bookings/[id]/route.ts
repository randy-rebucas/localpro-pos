import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import Booking from '@/models/Booking';
import User from '@/models/User';
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
    await connectDB();
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
    const booking = await Booking.findOne({ _id: id, tenantId })
      .populate('staffId', 'name email')
      .lean();

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
    await connectDB();
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
    const existingBooking = await Booking.findOne({ _id: id, tenantId });

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
      const staff = await User.findOne({ _id: staffId, tenantId, isActive: true });
      if (!staff) {
        return NextResponse.json(
          { success: false, error: t('validation.staffNotFound', 'Staff member not found or inactive') },
          { status: 404 }
        );
      }
    }

    // Build the update and apply it inside a transaction so the conflict
    // check and the write happen back-to-back: findByIdAndUpdate would skip
    // the model's pre('save') overlap re-check entirely (that hook only runs
    // on .save()/.create()), which let concurrent reschedules double-book
    // the same staff member. Using existingBooking.save() here means the
    // overlap check always runs immediately before the write commits.
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

    const session = await mongoose.startSession();
    let updatedBooking;
    try {
      await session.withTransaction(async () => {
        if (startTime || duration) {
          const conflictingBookings = await Booking.find({
            tenantId,
            _id: { $ne: id },
            status: { $in: ['pending', 'confirmed'] },
            startTime: { $lt: newEndTime },
            endTime: { $gt: newStartTime },
          }).session(session);

          const checkStaffId = staffId || existingBooking.staffId;
          if (checkStaffId) {
            const staffConflicts = conflictingBookings.filter(
              (booking) => booking.staffId?.toString() === checkStaffId.toString()
            );
            if (staffConflicts.length > 0) {
              throw new BookingConflictError(
                t('validation.staffBookingConflict', 'Staff member already has a booking at this time'),
                staffConflicts
              );
            }
          }
        }

        existingBooking.set(updateData);
        // Re-checked by the model's pre('save') hook too (staff overlap),
        // using this same session/snapshot.
        await existingBooking.save({ session });
      });

      updatedBooking = await Booking.findById(id).populate('staffId', 'name email');
    } catch (txError) {
      if (txError instanceof BookingConflictError) {
        return NextResponse.json(
          { success: false, error: txError.message, conflicts: txError.conflicts },
          { status: 409 }
        );
      }
      throw txError;
    } finally {
      await session.endSession();
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
          await Booking.findByIdAndUpdate(id, { confirmationSent: true });
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
    await connectDB();
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
    const booking = await Booking.findOne({ _id: id, tenantId });

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

    booking.isActive = false;
    booking.status = 'cancelled';
    await booking.save();

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

