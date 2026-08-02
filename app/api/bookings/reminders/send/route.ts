import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { sendBookingReminder } from '@/lib/notifications';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { getTenantSettingsById } from '@/lib/tenant';
import { requireBookingSchedulingAccess } from '@/lib/booking-scheduling-access';
import { logger } from '@/lib/logger';

/**
 * POST - Send reminders for upcoming bookings
 * Query params:
 * - hoursBefore: number of hours before booking to send reminder (default: 24)
 * - tenant: tenant slug (required)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const t = await getValidationTranslatorFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: t('validation.unauthorized', 'Unauthorized') },
        { status: 401 }
      );
    }

    // Only allow admins/managers to trigger reminders manually
    // In production, this would be called by a cron job
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'bookings.send_reminders'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    try {
      await requireBookingSchedulingAccess(tenantId.toString());
    } catch (featureError: unknown) {
      const msg = featureError instanceof Error ? featureError.message : 'Forbidden';
      return NextResponse.json({ success: false, error: msg }, { status: 403 });
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
    const bookingsToRemind = await prisma.booking.findMany({
      where: {
        tenantId,
        startTime: {
          gte: reminderWindowStart,
          lte: reminderWindowEnd,
        },
        status: { in: ['pending', 'confirmed'] },
        reminderSent: { not: true },
      },
    });

    const tenantSettings = await getTenantSettingsById(tenantId);
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
          customerEmail: booking.customerEmail ?? undefined,
          customerPhone: booking.customerPhone ?? undefined,
          serviceName: booking.serviceName,
          startTime: booking.startTime,
          endTime: booking.endTime,
          staffName: booking.staffName ?? undefined,
          notes: booking.notes ?? undefined,
          bookingId: booking.id,
        }, tenantSettings || undefined);

        // Mark reminder as sent
        await prisma.booking.update({ where: { id: booking.id }, data: { reminderSent: true } });
        results.sent++;
        results.details.push({
          bookingId: booking.id,
          success: true,
        });
      } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        results.failed++;
        results.details.push({
          bookingId: booking.id,
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
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Send reminders error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToSendReminders', 'Failed to send reminders') },
      { status: 500 }
    );
  }
}
