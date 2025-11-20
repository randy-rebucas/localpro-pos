import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Booking from '@/models/Booking';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireRole, getCurrentUser } from '@/lib/auth';
import { sendBookingReminder } from '@/lib/notifications';

/**
 * POST - Send reminder for a booking
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await requireRole(request, ['owner', 'admin', 'manager', 'cashier']);
    const tenantId = await getTenantIdFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 404 }
      );
    }

    const { id } = await params;
    const booking = await Booking.findOne({ _id: id, tenantId }).lean();

    if (!booking) {
      return NextResponse.json(
        { success: false, error: 'Booking not found' },
        { status: 404 }
      );
    }

    if (booking.status === 'cancelled' || booking.status === 'completed') {
      return NextResponse.json(
        { success: false, error: 'Cannot send reminder for cancelled or completed bookings' },
        { status: 400 }
      );
    }

    const results = await sendBookingReminder({
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

    // Update reminder sent status
    await Booking.findByIdAndUpdate(id, { reminderSent: true });

    return NextResponse.json({
      success: true,
      message: 'Reminder sent successfully',
      results,
    });
  } catch (error: any) {
    console.error('Send reminder error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to send reminder' },
      { status: 500 }
    );
  }
}

