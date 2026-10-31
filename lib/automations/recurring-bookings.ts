/**
 * Recurring Booking Generation
 * Reads RecurringBookingTemplate documents and creates Booking records
 * for each upcoming slot within the look-ahead window.
 */

import connectDB from '@/lib/mongodb';
import Booking from '@/models/Booking';
import RecurringBookingTemplate from '@/models/RecurringBookingTemplate';
import { addDaysToYmd, getTenantYmd, tenantLocalTimeToUtc } from '@/lib/timezone';
import { getAutomationTenants } from './tenants';
import { tenantTimezone, weekdayOfYmd } from './local-time';
import { AutomationResult } from './types';

export interface RecurringBookingOptions {
  tenantId?: string;
  daysAhead?: number; // How many days ahead to generate bookings (default: 30)
}

/**
 * Returns every local calendar date ('YYYY-MM-DD' in the tenant's timezone)
 * between today and today+daysAhead (inclusive) that matches the template's
 * recurrence rule. Calendar math is done on tenant-local dates, never on the
 * server clock (UTC on Vercel).
 */
export function getOccurrenceDates(
  template: {
    recurrenceType: 'daily' | 'weekly' | 'monthly';
    daysOfWeek?: number[];
    dayOfMonth?: number;
    effectiveFrom: Date;
    effectiveTo?: Date | null;
  },
  daysAhead: number,
  tz: string,
  now: Date = new Date()
): string[] {
  const today = getTenantYmd(now, tz);
  const until = addDaysToYmd(today, daysAhead);
  const effectiveFrom = getTenantYmd(new Date(template.effectiveFrom), tz);
  const effectiveTo = template.effectiveTo ? getTenantYmd(new Date(template.effectiveTo), tz) : null;

  const dates: string[] = [];
  // 'YYYY-MM-DD' strings compare correctly as plain strings
  let cursor = effectiveFrom > today ? effectiveFrom : today;

  while (cursor <= until) {
    // Don't generate past the effectiveTo date
    if (effectiveTo && cursor > effectiveTo) break;

    let matches = false;

    if (template.recurrenceType === 'daily') {
      matches = true;
    } else if (template.recurrenceType === 'weekly') {
      const days = template.daysOfWeek ?? [];
      matches = days.includes(weekdayOfYmd(cursor));
    } else if (template.recurrenceType === 'monthly') {
      matches = Number(cursor.slice(8, 10)) === (template.dayOfMonth ?? 1);
    }

    if (matches) dates.push(cursor);

    cursor = addDaysToYmd(cursor, 1);
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
    // Get tenants to process (only those with booking scheduling enabled)
    const tenants = await getAutomationTenants({
      tenantId: options.tenantId,
      filter: { 'settings.enableBookingScheduling': true },
      select: '_id settings.timezone',
    });
    if (options.tenantId && tenants.length === 0) {
      results.message = `Tenant ${options.tenantId} not found`;
      return results;
    }

    for (const tenant of tenants) {
      const tenantId = tenant._id;
      const tz = tenantTimezone(tenant.settings);
      const now = new Date();
      const templates = await RecurringBookingTemplate.find({
        tenantId,
        isActive: true,
        effectiveFrom: { $lte: now },
        $or: [
          { effectiveTo: { $exists: false } },
          { effectiveTo: null },
          { effectiveTo: { $gte: now } },
        ],
      })
        .select(
          'recurrenceType daysOfWeek dayOfMonth effectiveFrom effectiveTo startTimeHour startTimeMinute duration ' +
          'customerName customerEmail customerPhone serviceName serviceDescription staffId staffName notes'
        )
        .lean();

      if (templates.length === 0) continue;

      // Expand every template into its upcoming slots
      const slots = templates.flatMap((template) =>
        getOccurrenceDates(template, daysAhead, tz, now).map((date) => {
          // The template's wall-clock start time on that local date, in the tenant's timezone
          const hhmm = `${String(template.startTimeHour).padStart(2, '0')}:${String(template.startTimeMinute ?? 0).padStart(2, '0')}`;
          const startTime = tenantLocalTimeToUtc(date, hhmm, tz);
          const endTime = new Date(startTime.getTime() + template.duration * 60_000);
          return { template, date, startTime, endTime };
        })
      );

      if (slots.length === 0) continue;

      // Load existing bookings for all candidate slots in one query (avoid duplicates)
      const slotKey = (staffId: unknown, startTime: Date) =>
        `${staffId ? String(staffId) : ''}|${startTime.getTime()}`;
      const existingBookings = await Booking.find({
        tenantId,
        startTime: { $in: [...new Set(slots.map((s) => s.startTime.getTime()))].map((t) => new Date(t)) },
        status: { $nin: ['cancelled'] },
      })
        .select('staffId startTime')
        .lean();
      const existingKeys = new Set(existingBookings.map((b) => slotKey(b.staffId, b.startTime)));

      for (const { template, date, startTime, endTime } of slots) {
        const key = slotKey(template.staffId, startTime);
        if (existingKeys.has(key)) continue;

        try {
          // Booking.create (not insertMany) so the pre-save staff overlap check still runs
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

          existingKeys.add(key);
          results.processed++;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          results.failed++;
          results.errors?.push(
            `Template ${template._id.toString()} on ${date}: ${message}`
          );
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
