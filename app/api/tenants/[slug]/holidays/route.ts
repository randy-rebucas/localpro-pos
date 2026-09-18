/**
 * Holidays API
 * Handles CRUD operations for holiday calendar
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { roleAtLeast } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';

function toResponseShape(h: {
  id: string; name: string; date: string; type: string;
  recurringPattern: string | null; recurringDayOfMonth: number | null;
  recurringDayOfWeek: number | null; recurringMonth: number | null;
  isBusinessClosed: boolean; createdAt: Date;
}) {
  return {
    id: h.id,
    name: h.name,
    date: h.date,
    type: h.type,
    isBusinessClosed: h.isBusinessClosed,
    createdAt: h.createdAt,
    ...(h.type === 'recurring'
      ? {
          recurring: {
            pattern: h.recurringPattern,
            dayOfMonth: h.recurringDayOfMonth,
            dayOfWeek: h.recurringDayOfWeek,
            month: h.recurringMonth,
          },
        }
      : {}),
  };
}

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
    const tenant = await prisma.tenant.findFirst({ where: { slug }, include: { holidays: true } });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      data: tenant.holidays.map(toResponseShape),
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error fetching holidays:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!roleAtLeast(user.role, 'manager')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const rl = checkRateLimit(`holidays:${user.userId}`, 20, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const { slug } = await params;
    const body = await request.json();
    const { name, date, type, recurring, isBusinessClosed } = body;

    if (!name || !type) {
      return NextResponse.json({ success: false, error: 'Name and type are required' }, { status: 400 });
    }

    // For single date holidays, date is required
    if (type === 'single' && !date) {
      return NextResponse.json({ success: false, error: 'Date is required for single date holidays' }, { status: 400 });
    }

    // For recurring holidays, recurring pattern is required
    if (type === 'recurring') {
      if (!recurring || !recurring.pattern) {
        return NextResponse.json({ success: false, error: 'Recurring pattern is required for recurring holidays' }, { status: 400 });
      }
      // Validate recurring pattern based on type
      if (recurring.pattern === 'yearly' && (!recurring.month || !recurring.dayOfMonth)) {
        return NextResponse.json({ success: false, error: 'Month and day of month are required for yearly recurring holidays' }, { status: 400 });
      }
      if (recurring.pattern === 'monthly' && !recurring.dayOfMonth) {
        return NextResponse.json({ success: false, error: 'Day of month is required for monthly recurring holidays' }, { status: 400 });
      }
      if (recurring.pattern === 'weekly' && recurring.dayOfWeek === undefined) {
        return NextResponse.json({ success: false, error: 'Day of week is required for weekly recurring holidays' }, { status: 400 });
      }
    }

    const tenant = await prisma.tenant.findFirst({ where: { slug } });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const id = `holiday_${Date.now()}`;
    const resolvedDate = type === 'single'
      ? date
      : (recurring?.month && recurring?.dayOfMonth
          ? `${new Date().getFullYear()}-${String(recurring.month).padStart(2, '0')}-${String(recurring.dayOfMonth).padStart(2, '0')}`
          : '');

    let created;
    try {
      created = await prisma.tenantHoliday.create({
        data: {
          id,
          tenantId: tenant.id,
          name,
          date: resolvedDate,
          type,
          isBusinessClosed: isBusinessClosed !== undefined ? isBusinessClosed : true,
          recurringPattern: type === 'recurring' ? recurring?.pattern ?? null : null,
          recurringDayOfMonth: type === 'recurring' ? recurring?.dayOfMonth ?? null : null,
          recurringDayOfWeek: type === 'recurring' ? recurring?.dayOfWeek ?? null : null,
          recurringMonth: type === 'recurring' ? recurring?.month ?? null : null,
        },
      });
      logger.info('Holiday saved successfully:', created);
    } catch (saveError: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('Error saving holiday to database:', saveError);
      return NextResponse.json({
        success: false,
        error: `Failed to save holiday: ${saveError.message || 'Database error'}`
      }, { status: 500 });
    }

    const newHoliday = toResponseShape(created);

    await createAuditLog(request, {
      tenantId: tenant.id,
      userId: user.userId,
      action: AuditActions.CREATE,
      entityType: 'holiday',
      entityId: created.id,
      changes: newHoliday,
    });

    return NextResponse.json({
      success: true,
      data: newHoliday,
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error creating holiday:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
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

    if (!roleAtLeast(user.role, 'manager')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const rl = checkRateLimit(`holidays:${user.userId}`, 20, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const { slug } = await params;
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Holiday ID is required' }, { status: 400 });
    }

    const tenant = await prisma.tenant.findFirst({ where: { slug } });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const existing = await prisma.tenantHoliday.findFirst({ where: { id, tenantId: tenant.id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Holiday not found' }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (updates.name !== undefined) data.name = updates.name;
    if (updates.date !== undefined) data.date = updates.date;
    if (updates.type !== undefined) data.type = updates.type;
    if (updates.isBusinessClosed !== undefined) data.isBusinessClosed = updates.isBusinessClosed;
    if (updates.recurring !== undefined) {
      data.recurringPattern = updates.recurring?.pattern ?? null;
      data.recurringDayOfMonth = updates.recurring?.dayOfMonth ?? null;
      data.recurringDayOfWeek = updates.recurring?.dayOfWeek ?? null;
      data.recurringMonth = updates.recurring?.month ?? null;
    }

    let updated;
    try {
      // Scoped by tenantId + id (not just id) to preserve tenant isolation on write.
      const result = await prisma.tenantHoliday.updateMany({
        where: { id, tenantId: tenant.id },
        data,
      });
      if (result.count === 0) {
        return NextResponse.json({ success: false, error: 'Holiday not found' }, { status: 404 });
      }
      updated = await prisma.tenantHoliday.findFirst({ where: { id, tenantId: tenant.id } });
      logger.info('Holiday updated successfully:', updated ?? undefined);
    } catch (saveError: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('Error saving holiday update to database:', saveError);
      return NextResponse.json({
        success: false,
        error: `Failed to update holiday: ${saveError.message || 'Database error'}`
      }, { status: 500 });
    }

    const updatedHoliday = toResponseShape(updated!);

    await createAuditLog(request, {
      tenantId: tenant.id,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'holiday',
      entityId: id,
      changes: updates,
    });

    return NextResponse.json({
      success: true,
      data: updatedHoliday,
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error updating holiday:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!roleAtLeast(user.role, 'manager')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const rl = checkRateLimit(`holidays:${user.userId}`, 20, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Holiday ID is required' }, { status: 400 });
    }

    const tenant = await prisma.tenant.findFirst({ where: { slug } });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    try {
      const result = await prisma.tenantHoliday.deleteMany({ where: { id, tenantId: tenant.id } });
      if (result.count === 0) {
        return NextResponse.json({ success: false, error: 'Holiday not found' }, { status: 404 });
      }
      logger.info('Holiday deleted successfully');
    } catch (saveError: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error('Error saving holiday deletion to database:', saveError);
      return NextResponse.json({
        success: false,
        error: `Failed to delete holiday: ${saveError.message || 'Database error'}`
      }, { status: 500 });
    }

    await createAuditLog(request, {
      tenantId: tenant.id,
      userId: user.userId,
      action: AuditActions.DELETE,
      entityType: 'holiday',
      entityId: id,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error deleting holiday:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
