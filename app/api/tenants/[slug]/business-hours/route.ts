/**
 * Business Hours API
 * Handles CRUD operations for business hours and special hours
 */

import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { slug } = await params;
    await connectDB();

    const tenant = await Tenant.findOne({ slug });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant._id.toString()) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      data: tenant.settings.businessHours || {},
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error fetching business hours:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch business hours' }, { status: 500 });
  }
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Returns an error message for the first malformed time, or null. */
function findInvalidTime(schedule: unknown, specialHours: unknown): string | null {
  const check = (value: unknown, where: string) =>
    value === undefined || value === null || value === '' || (typeof value === 'string' && HHMM.test(value))
      ? null
      : `Invalid time for ${where}: use HH:MM (24-hour)`;

  if (schedule !== undefined) {
    if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) return 'Invalid schedule';
    for (const [day, entry] of Object.entries(schedule as Record<string, unknown>)) {
      if (!entry || typeof entry !== 'object') return `Invalid schedule for ${day}`;
      const e = entry as { openTime?: unknown; closeTime?: unknown; breaks?: unknown };
      const err = check(e.openTime, `${day} open`) || check(e.closeTime, `${day} close`);
      if (err) return err;
      if (e.breaks !== undefined) {
        if (!Array.isArray(e.breaks)) return `Invalid breaks for ${day}`;
        for (const b of e.breaks as Array<{ start?: unknown; end?: unknown }>) {
          const berr = check(b?.start, `${day} break start`) || check(b?.end, `${day} break end`);
          if (berr) return berr;
        }
      }
    }
  }
  if (specialHours !== undefined) {
    if (!Array.isArray(specialHours)) return 'Invalid special hours';
    for (const sh of specialHours as Array<{ date?: unknown; openTime?: unknown; closeTime?: unknown }>) {
      if (typeof sh?.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(sh.date)) return 'Invalid special hours date: use YYYY-MM-DD';
      const err = check(sh.openTime, `${sh.date} open`) || check(sh.closeTime, `${sh.date} close`);
      if (err) return err;
    }
  }
  return null;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = checkRateLimit(`business-hours:${user.userId}`, 20, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    // Same permission the Business Hours page and the settings PUT check,
    // so per-tenant role overrides apply here too.
    if (!(await hasTenantPermission(user.role, user.tenantId, 'business_hours.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { slug } = await params;
    const body = await request.json();
    const { schedule, specialHours, timezone } = body ?? {};

    if (timezone !== undefined && typeof timezone !== 'string') {
      return NextResponse.json({ success: false, error: 'Invalid timezone' }, { status: 400 });
    }
    const invalid = findInvalidTime(schedule, specialHours);
    if (invalid) {
      return NextResponse.json({ success: false, error: invalid }, { status: 400 });
    }

    await connectDB();

    const tenant = await Tenant.findOne({ slug });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant._id.toString()) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const previous = tenant.settings.businessHours
      ? JSON.parse(JSON.stringify(tenant.settings.businessHours))
      : undefined;

    tenant.settings.businessHours = {
      ...tenant.settings.businessHours,
      ...(timezone !== undefined && { timezone }),
      ...(schedule !== undefined && { schedule }),
      ...(specialHours !== undefined && { specialHours }),
    };

    tenant.markModified('settings.businessHours');
    await tenant.save();

    await createAuditLog(request, {
      tenantId: tenant._id,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'tenant',
      entityId: tenant._id.toString(),
      changes: { businessHours: { from: previous, to: { timezone, schedule, specialHours } } },
    });

    return NextResponse.json({
      success: true,
      data: tenant.settings.businessHours,
    });
  } catch (error: unknown) {
    logger.error('Error updating business hours:', error);
    return NextResponse.json({ success: false, error: 'Failed to update business hours' }, { status: 500 });
  }
}
