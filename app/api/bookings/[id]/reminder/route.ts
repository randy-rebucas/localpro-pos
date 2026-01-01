import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Booking from '@/models/Booking';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireRole, getCurrentUser } from '@/lib/auth';
import { sendBookingReminder } from '@/lib/notifications';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { getTenantSettingsById } from '@/lib/tenant';

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
    const booking = await Booking.findOne({ _id: id, tenantId }).lean();

    if (!booking) {
      return NextResponse.json(
        { success: false, error: t('validation.bookingNotFound', 'Booking not found') },
        { status: 404 }
      );
    }

    if (booking.status === 'cancelled' || booking.status === 'completed') {
      return NextResponse.json(
        { success: false, error: t('validation.cannotSendReminder', 'Cannot send reminder for cancelled or completed bookings') },
        { status: 400 }
      );
    }

    const tenantSettings = await getTenantSettingsById(tenantId);
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
    }, tenantSettings || undefined);

    // Update reminder sent status
    await Booking.findByIdAndUpdate(id, { reminderSent: true });

    return NextResponse.json({
      success: true,
      message: 'Reminder sent successfully',
      results,
    });
  } catch (error: any) {
    console.error('Send reminder error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToSendReminder', 'Failed to send reminder') },
      { status: 500 }
    );
  }
}

