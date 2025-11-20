import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Booking from '@/models/Booking';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireRole, getCurrentUser } from '@/lib/auth';
import { sendBookingReminder } from '@/lib/notifications';

/**
 * POST - Send reminders for upcoming bookings
 * Query params:
 * - hoursBefore: number of hours before booking to send reminder (default: 24)
 * - tenant: tenant slug (required)
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Only allow admins/managers to trigger reminders manually
    // In production, this would be called by a cron job
    await requireRole(request, ['owner', 'admin', 'manager']);
    const tenantId = await getTenantIdFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const hoursBefore = parseInt(searchParams.get('hoursBefore') || '24', 10);

    // Calculate the time window for bookings that need reminders
    const now = new Date();
    const reminderWindowStart = new Date(now.getTime() + hoursBefore * 60 * 60 * 1000);
    const reminderWindowEnd = new Date(reminderWindowStart.getTime() + 60 * 60 * 1000); // 1 hour window

    // Find bookings that:
    // 1. Are in the reminder window
    // 2. Are pending or confirmed
    // 3. Haven't had a reminder sent yet
    const bookingsToRemind = await Booking.find({
      tenantId,
      startTime: {
        $gte: reminderWindowStart,
        $lte: reminderWindowEnd,
      },
      status: { $in: ['pending', 'confirmed'] },
      reminderSent: { $ne: true },
    }).lean();

    const results = {
      total: bookingsToRemind.length,
      sent: 0,
      failed: 0,
      details: [] as Array<{ bookingId: string; success: boolean; error?: string }>,
    };

    for (const booking of bookingsToRemind) {
      try {
        await sendBookingReminder({
          customerName: booking.customerName,
          customerEmail: booking.customerEmail,
          customerPhone: booking.customerPhone,
          serviceName: booking.serviceName,
          startTime: booking.startTime,
          endTime: booking.endTime,
          staffName: booking.staffName,
          notes: booking.notes,
          bookingId: booking._id.toString(),
        });

        // Mark reminder as sent
        await Booking.findByIdAndUpdate(booking._id, { reminderSent: true });
        results.sent++;
        results.details.push({
          bookingId: booking._id.toString(),
          success: true,
        });
      } catch (error: any) {
        results.failed++;
        results.details.push({
          bookingId: booking._id.toString(),
          success: false,
          error: error.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${results.total} bookings`,
      results,
    });
  } catch (error: any) {
    console.error('Send reminders error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to send reminders' },
      { status: 500 }
    );
  }
}

