import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Booking from '@/models/Booking';
import User from '@/models/User';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireRole, getCurrentUser } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { sendBookingConfirmation, sendBookingCancellation, sendBookingReminder } from '@/lib/notifications'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { getTenantSettingsById } from '@/lib/tenant';

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
    console.error('Get booking error:', error);
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

    await requireRole(request, ['owner', 'admin', 'manager', 'cashier']);
    const tenantId = await getTenantIdFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
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

    // Check for conflicts if time changed
    if (startTime || duration) {
      const conflictingBookings = await Booking.find({
        tenantId,
        _id: { $ne: id },
        status: { $in: ['pending', 'confirmed'] },
        $or: [
          {
            startTime: { $lt: newEndTime },
            endTime: { $gt: newStartTime },
          },
        ],
      });

      const checkStaffId = staffId || existingBooking.staffId;
      if (checkStaffId) {
        const staffConflicts = conflictingBookings.filter(
          (booking) => booking.staffId?.toString() === checkStaffId.toString()
        );
        if (staffConflicts.length > 0) {
          return NextResponse.json(
            {
              success: false,
              error: t('validation.staffBookingConflict', 'Staff member already has a booking at this time'),
              conflicts: staffConflicts,
            },
            { status: 409 }
          );
        }
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

    const updatedBooking = await Booking.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    ).populate('staffId', 'name email');

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
        console.error('Failed to send booking notification:', notificationError);
        // Don't fail the update if notification fails
      }
    }

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'booking',
      entityId: id,
      changes: updateData,
    });

    return NextResponse.json({ success: true, data: updatedBooking });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Update booking error:', error);
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

    await requireRole(request, ['owner', 'admin', 'manager', 'cashier']);
    const tenantId = await getTenantIdFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
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
        console.error('Failed to send cancellation notification:', notificationError);
      }
    }

    await Booking.findByIdAndDelete(id);

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DELETE,
      entityType: 'booking',
      entityId: id,
      changes: { customerName: booking.customerName, serviceName: booking.serviceName },
    });

    return NextResponse.json({ success: true, message: t('validation.bookingDeleted', 'Booking deleted successfully') });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Delete booking error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToDeleteBooking', 'Failed to delete booking') },
      { status: 500 }
    );
  }
}

