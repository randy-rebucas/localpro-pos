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
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { parseBusinessHoursInput } from '@/lib/business-hours-input';

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
    const body = await request.json().catch(() => null);
    const parsed = parseBusinessHoursInput(body);
    if (!parsed.ok) {
      const t = await getValidationTranslatorFromRequest(request);
      const message = t(parsed.error.key, parsed.error.fallback).replace('{value}', parsed.error.value ?? '');
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
    const { schedule, specialHours, timezone } = parsed.data;

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
