import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Booking from '@/models/Booking';
import User from '@/models/User';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireRole, getCurrentUser } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { sendBookingConfirmation } from '@/lib/notifications';
import { getTenantSettingsById } from '@/lib/tenant';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

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
    await connectDB();
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const tenantId = await getTenantIdFromRequest(request);
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const status = searchParams.get('status');
    const staffId = searchParams.get('staffId');

    // Build query
    const query: any = { tenantId };

    if (startDate || endDate) {
      query.startTime = {};
      if (startDate) {
        query.startTime.$gte = new Date(startDate);
      }
      if (endDate) {
        query.startTime.$lte = new Date(endDate);
      }
    }

    if (status) {
      query.status = status;
    }

    if (staffId) {
      query.staffId = staffId;
    }

    const bookings = await Booking.find(query)
      .populate('staffId', 'name email')
      .sort({ startTime: 1 })
      .lean();

    return NextResponse.json({ success: true, data: bookings });
  } catch (error: any) {
    console.error('Get bookings error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch bookings' },
      { status: 500 }
    );
  }
}

/**
 * POST - Create a new booking
 */
export async function POST(request: NextRequest) {
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

    // Allow cashiers and above to create bookings
    await requireRole(request, ['owner', 'admin', 'manager', 'cashier']);
    const tenantId = await getTenantIdFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
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
      status = 'pending',
    } = body;

    // Validation
    if (!customerName || !serviceName || !startTime || !duration) {
      return NextResponse.json(
        { success: false, error: t('validation.bookingFieldsRequired', 'Customer name, service name, start time, and duration are required') },
        { status: 400 }
      );
    }

    const start = new Date(startTime);
    const end = new Date(start.getTime() + duration * 60000);

    // Check for conflicts with existing bookings
    const conflictingBookings = await Booking.find({
      tenantId,
      status: { $in: ['pending', 'confirmed'] },
      $or: [
        {
          startTime: { $lt: end },
          endTime: { $gt: start },
        },
      ],
    });

    // If staff is assigned, check for conflicts with that staff member
    if (staffId) {
      const staffConflicts = conflictingBookings.filter(
        (booking) => booking.staffId?.toString() === staffId
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
    } else {
      // If no staff assigned, check for any conflicts
      if (conflictingBookings.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: t('validation.timeSlotBooked', 'Time slot is already booked'),
            conflicts: conflictingBookings,
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

    // Create booking
    const booking = await Booking.create({
      tenantId,
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
    });

    // Send confirmation if status is confirmed and contact info is provided
    if (status === 'confirmed' && (customerEmail || customerPhone)) {
      try {
        const tenantSettings = await getTenantSettingsById(tenantId);
        await sendBookingConfirmation({
          customerName,
          customerEmail,
          customerPhone,
          serviceName,
          startTime: start,
          endTime: end,
          staffName: booking.staffName,
          notes,
          bookingId: booking._id.toString(),
        }, tenantSettings || undefined);
        await Booking.findByIdAndUpdate(booking._id, { confirmationSent: true });
      } catch (notificationError) {
        console.error('Failed to send booking confirmation:', notificationError);
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

    const bookingData = await Booking.findById(booking._id)
      .populate('staffId', 'name email')
      .lean();

    return NextResponse.json(
      { success: true, data: bookingData },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Create booking error:', error);
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

