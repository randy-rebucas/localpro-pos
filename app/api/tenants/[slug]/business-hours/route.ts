/**
 * Business Hours API
 * Handles CRUD operations for business hours and special hours
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma, { dbTransaction } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { roleAtLeast } from '@/lib/permissions';
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
    const tenant = await prisma.tenant.findFirst({
      where: { slug },
      include: {
        settings: true,
        businessHours: { include: { breaks: true } },
        specialHours: true,
      },
    });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const schedule: Record<string, unknown> = {};
    for (const day of tenant.businessHours) {
      schedule[String(day.dayOfWeek)] = {
        enabled: day.enabled,
        openTime: day.openTime,
        closeTime: day.closeTime,
        breaks: day.breaks.map((b) => ({ start: b.start, end: b.end })),
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        timezone: tenant.settings?.businessHoursTimezone ?? null,
        schedule,
        specialHours: tenant.specialHours.map((sh) => ({
          date: sh.date,
          enabled: sh.enabled,
          openTime: sh.openTime,
          closeTime: sh.closeTime,
          note: sh.note,
        })),
      },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error fetching business hours:', error);
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

    const { slug } = await params;
    const body = await request.json();
    const { schedule, specialHours, timezone } = body;

    const tenant = await prisma.tenant.findFirst({ where: { slug } });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    await dbTransaction(async (tx) => {
      if (timezone !== undefined) {
        await tx.tenantSettings.upsert({
          where: { tenantId: tenant.id },
          create: { tenantId: tenant.id, businessHoursTimezone: timezone },
          update: { businessHoursTimezone: timezone },
        });
      }

      if (schedule !== undefined) {
        for (const [dayKey, dayValueRaw] of Object.entries(schedule as Record<string, any>)) { // eslint-disable-line @typescript-eslint/no-explicit-any
          const dayOfWeek = Number(dayKey);
          if (Number.isNaN(dayOfWeek)) continue;
          const dayValue = dayValueRaw as { enabled?: boolean; openTime?: string; closeTime?: string; breaks?: { start: string; end: string }[] };

          const businessHour = await tx.tenantBusinessHour.upsert({
            where: { tenantId_dayOfWeek: { tenantId: tenant.id, dayOfWeek } },
            create: {
              id: `${tenant.id}_bh_${dayOfWeek}`,
              tenantId: tenant.id,
              dayOfWeek,
              enabled: dayValue.enabled ?? true,
              openTime: dayValue.openTime ?? null,
              closeTime: dayValue.closeTime ?? null,
            },
            update: {
              enabled: dayValue.enabled ?? true,
              openTime: dayValue.openTime ?? null,
              closeTime: dayValue.closeTime ?? null,
            },
          });

          if (dayValue.breaks !== undefined) {
            await tx.tenantBusinessHourBreak.deleteMany({ where: { businessHourId: businessHour.id } });
            if (Array.isArray(dayValue.breaks) && dayValue.breaks.length > 0) {
              await tx.tenantBusinessHourBreak.createMany({
                data: dayValue.breaks.map((b, idx) => ({
                  id: `${businessHour.id}_brk_${idx}_${Date.now()}`,
                  businessHourId: businessHour.id,
                  start: b.start,
                  end: b.end,
                })),
              });
            }
          }
        }
      }

      if (specialHours !== undefined) {
        // Full-array replace, matching the previous Mongoose shallow-merge
        // semantics (the caller always sends the complete special hours list).
        await tx.tenantSpecialHours.deleteMany({ where: { tenantId: tenant.id } });
        if (Array.isArray(specialHours) && specialHours.length > 0) {
          await tx.tenantSpecialHours.createMany({
            data: specialHours.map((sh: { date: string; enabled?: boolean; openTime?: string; closeTime?: string; note?: string }, idx: number) => ({
              id: `${tenant.id}_sh_${idx}_${Date.now()}`,
              tenantId: tenant.id,
              date: sh.date,
              enabled: sh.enabled ?? true,
              openTime: sh.openTime ?? null,
              closeTime: sh.closeTime ?? null,
              note: sh.note ?? null,
            })),
          });
        }
      }
    });

    const updated = await prisma.tenant.findFirst({
      where: { id: tenant.id },
      include: { settings: true, businessHours: { include: { breaks: true } }, specialHours: true },
    });

    const responseSchedule: Record<string, unknown> = {};
    for (const day of updated?.businessHours ?? []) {
      responseSchedule[String(day.dayOfWeek)] = {
        enabled: day.enabled,
        openTime: day.openTime,
        closeTime: day.closeTime,
        breaks: day.breaks.map((b) => ({ start: b.start, end: b.end })),
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        timezone: updated?.settings?.businessHoursTimezone ?? null,
        schedule: responseSchedule,
        specialHours: (updated?.specialHours ?? []).map((sh) => ({
          date: sh.date,
          enabled: sh.enabled,
          openTime: sh.openTime,
          closeTime: sh.closeTime,
          note: sh.note,
        })),
      },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error updating business hours:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
