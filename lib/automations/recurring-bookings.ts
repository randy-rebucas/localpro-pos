/**
 * Recurring Booking Generation
 * Reads RecurringBookingTemplate documents and creates Booking records
 * for each upcoming slot within the look-ahead window.
 */

import connectDB from '@/lib/mongodb';
import Booking from '@/models/Booking';
import RecurringBookingTemplate from '@/models/RecurringBookingTemplate';
import Tenant from '@/models/Tenant';
import { AutomationResult } from './types';

export interface RecurringBookingOptions {
  tenantId?: string;
  daysAhead?: number; // How many days ahead to generate bookings (default: 30)
}

/**
 * Returns every calendar date between today and today+daysAhead (inclusive)
 * that matches the template's recurrence rule.
 */
function getOccurrenceDates(
  template: {
    recurrenceType: 'daily' | 'weekly' | 'monthly';
    daysOfWeek?: number[];
    dayOfMonth?: number;
    effectiveFrom: Date;
    effectiveTo?: Date;
  },
  daysAhead: number
): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const until = new Date(today);
  until.setDate(until.getDate() + daysAhead);
  until.setHours(23, 59, 59, 999);

  const effectiveFrom = new Date(template.effectiveFrom);
  effectiveFrom.setHours(0, 0, 0, 0);

  const effectiveTo = template.effectiveTo ? new Date(template.effectiveTo) : null;
  if (effectiveTo) effectiveTo.setHours(23, 59, 59, 999);

  const dates: Date[] = [];
  const cursor = new Date(Math.max(today.getTime(), effectiveFrom.getTime()));

  while (cursor <= until) {
    // Don't generate past the effectiveTo date
    if (effectiveTo && cursor > effectiveTo) break;

    let matches = false;

    if (template.recurrenceType === 'daily') {
      matches = true;
    } else if (template.recurrenceType === 'weekly') {
      const days = template.daysOfWeek ?? [];
      matches = days.includes(cursor.getDay());
    } else if (template.recurrenceType === 'monthly') {
      matches = cursor.getDate() === (template.dayOfMonth ?? 1);
    }

    if (matches) {
      dates.push(new Date(cursor));
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

/**
 * Generate recurring bookings from active templates.
 * Skips days that already have a booking for the same tenant+staff+startTime.
 */
export async function generateRecurringBookings(
  options: RecurringBookingOptions = {}
): Promise<AutomationResult> {
  await connectDB();

  const daysAhead = options.daysAhead ?? 30;

  const results: AutomationResult = {
    success: true,
    message: '',
    processed: 0,
    failed: 0,
    errors: [],
  };

  try {
    // Get tenants to process
    let tenantIds: string[];
    if (options.tenantId) {
      const tenant = await Tenant.findById(options.tenantId).select('_id').lean();
      if (!tenant) {
        results.message = `Tenant ${options.tenantId} not found`;
        return results;
      }
      tenantIds = [options.tenantId];
    } else {
      const tenants = await Tenant.find({ status: 'active' }).select('_id').lean();
      tenantIds = tenants.map(t => t._id.toString());
    }

    for (const tenantId of tenantIds) {
      const templates = await RecurringBookingTemplate.find({
        tenantId,
        isActive: true,
        effectiveFrom: { $lte: new Date() },
        $or: [
          { effectiveTo: { $exists: false } },
          { effectiveTo: null },
          { effectiveTo: { $gte: new Date() } },
        ],
      }).lean();

      for (const template of templates) {
        const occurrences = getOccurrenceDates(template, daysAhead);

        for (const date of occurrences) {
          const startTime = new Date(date);
          startTime.setHours(template.startTimeHour, template.startTimeMinute, 0, 0);
          const endTime = new Date(startTime.getTime() + template.duration * 60_000);

          try {
            // Check if a booking for this slot already exists (avoid duplicates)
            const existing = await Booking.findOne({
              tenantId,
              staffId: template.staffId ?? null,
              startTime,
              status: { $nin: ['cancelled'] },
            }).lean();

            if (existing) continue;

            await Booking.create({
              tenantId,
              customerName: template.customerName,
              customerEmail: template.customerEmail,
              customerPhone: template.customerPhone,
              serviceName: template.serviceName,
              serviceDescription: template.serviceDescription,
              staffId: template.staffId,
              staffName: template.staffName,
              startTime,
              endTime,
              duration: template.duration,
              status: 'pending',
              notes: template.notes
                ? `[Recurring] ${template.notes}`
                : '[Recurring booking]',
              isActive: true,
            });

            results.processed++;
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            results.failed++;
            results.errors?.push(
              `Template ${template._id.toString()} on ${date.toISOString().slice(0, 10)}: ${message}`
            );
          }
        }
      }
    }

    results.message = `Generated ${results.processed} recurring booking(s)${results.failed > 0 ? `, ${results.failed} failed` : ''}`;
    return results;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    results.success = false;
    results.message = `Error generating recurring bookings: ${message}`;
    results.errors?.push(message);
    return results;
  }
}
