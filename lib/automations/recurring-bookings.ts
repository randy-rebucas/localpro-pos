/**
 * Recurring Booking Generation
 * Reads RecurringBookingTemplate documents and creates Booking records
 * for each upcoming slot within the look-ahead window.
 */

import connectDB from '@/lib/mongodb';
import Booking from '@/models/Booking';
import RecurringBookingTemplate from '@/models/RecurringBookingTemplate';
import Tenant from '@/models/Tenant';
import { getActiveTenants, type ActiveTenant } from '@/lib/tenant-active-query';
import { getTenantDayBoundaries, DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone';
import { AutomationResult } from './types';

export interface RecurringBookingOptions {
  tenantId?: string;
  daysAhead?: number; // How many days ahead to generate bookings (default: 30)
}

const TENANT_FIELDS = 'settings.timezone';
const DAY_MS = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' of `date` as observed in `tz`. */
function ymdInTz(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/**
 * Returns every calendar date (as 'YYYY-MM-DD' in the tenant's timezone)
 * between today and today+daysAhead (inclusive) that matches the template's
 * recurrence rule. Day-of-week / day-of-month are evaluated on the tenant's
 * local calendar, not the server's (UTC on Vercel).
 */
function getOccurrenceDates(
  template: {
    recurrenceType: 'daily' | 'weekly' | 'monthly';
    daysOfWeek?: number[];
    dayOfMonth?: number;
    effectiveFrom: Date;
    effectiveTo?: Date;
  },
  daysAhead: number,
  tz: string
): string[] {
  const today = ymdInTz(new Date(), tz);
  const effectiveFrom = ymdInTz(new Date(template.effectiveFrom), tz);
  const effectiveTo = template.effectiveTo ? ymdInTz(new Date(template.effectiveTo), tz) : null;

  const dates: string[] = [];
  const todayNoon = new Date(`${today}T12:00:00Z`).getTime(); // noon UTC: no DST edge flips

  for (let i = 0; i <= daysAhead; i++) {
    const noon = new Date(todayNoon + i * DAY_MS);
    const ymd = noon.toISOString().slice(0, 10);

    if (ymd < effectiveFrom) continue;
    // Don't generate past the effectiveTo date
    if (effectiveTo && ymd > effectiveTo) break;

    let matches = false;

    if (template.recurrenceType === 'daily') {
      matches = true;
    } else if (template.recurrenceType === 'weekly') {
      const days = template.daysOfWeek ?? [];
      matches = days.includes(noon.getUTCDay());
    } else if (template.recurrenceType === 'monthly') {
      matches = noon.getUTCDate() === (template.dayOfMonth ?? 1);
    }

    if (matches) {
      dates.push(ymd);
    }
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
    let tenants: ActiveTenant[];
    if (options.tenantId) {
      const tenant = await Tenant.findById(options.tenantId)
        .select(`_id slug name ${TENANT_FIELDS}`)
        .lean<ActiveTenant>();
      if (!tenant) {
        results.message = `Tenant ${options.tenantId} not found`;
        return results;
      }
      tenants = [tenant];
    } else {
      tenants = await getActiveTenants(TENANT_FIELDS);
    }

    for (const tenant of tenants) {
      const tenantId = tenant._id;
      const settings = (tenant.settings ?? {}) as { timezone?: string };
      const tz = settings.timezone || DEFAULT_TENANT_TIMEZONE;
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
      }).lean();

      if (templates.length === 0) continue;

      // Expand every template into concrete slots first…
      const slots = templates.flatMap((template) =>
        getOccurrenceDates(template, daysAhead, tz).map((ymd) => {
          const dayStart = getTenantDayBoundaries(ymd, tz).start;
          const startTime = new Date(
            dayStart.getTime() + (template.startTimeHour * 60 + template.startTimeMinute) * 60_000
          );
          const endTime = new Date(startTime.getTime() + template.duration * 60_000);
          return { template, ymd, startTime, endTime };
        })
      );
      if (slots.length === 0) continue;

      // …then check which already exist with ONE query (was one findOne per slot)
      const slotKey = (staffId: unknown, startTime: Date) => `${staffId ? String(staffId) : ''}|${startTime.getTime()}`;
      const existing = await Booking.find({
        tenantId,
        startTime: { $in: [...new Set(slots.map((s) => s.startTime.getTime()))].map((t) => new Date(t)) },
        status: { $nin: ['cancelled'] },
      })
        .select('staffId startTime')
        .lean();
      const taken = new Set(existing.map((b) => slotKey(b.staffId, new Date(b.startTime))));

      for (const { template, ymd, startTime, endTime } of slots) {
        const key = slotKey(template.staffId, startTime);
        // Check if a booking for this slot already exists (avoid duplicates)
        if (taken.has(key)) continue;

        try {
          // Inserts stay one-by-one: each is a billed write either way, and
          // per-document create keeps validation errors isolated per slot.
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

          taken.add(key);
          results.processed++;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          results.failed++;
          results.errors?.push(
            `Template ${template._id.toString()} on ${ymd}: ${message}`
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
