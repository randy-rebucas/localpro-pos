/**
 * Country-based holiday suggestions for the Holiday Calendar admin page.
 * GET returns the current public/bank holidays for the tenant's (or an
 * explicitly requested) country, cross-checked against holidays already on
 * file so the UI can grey those out. POST bulk-imports the admin's selection
 * as real TenantHoliday rows.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { roleAtLeast } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';
import {
  getCountryOptions,
  getPublicHolidaySuggestions,
  isValidCountryCode,
  resolveCountryCode,
} from '@/lib/holidays-country';

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
      include: { settings: true, holidays: true },
    });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      return NextResponse.json({ success: false, error: 'Invalid year' }, { status: 400 });
    }

    const countryParam = searchParams.get('country');
    let countryCode: string | null = null;
    if (countryParam) {
      if (!isValidCountryCode(countryParam)) {
        return NextResponse.json({ success: false, error: 'Unknown country code' }, { status: 400 });
      }
      countryCode = countryParam.toUpperCase();
    } else {
      countryCode = resolveCountryCode(tenant.settings?.addressCountry);
    }

    const existingByDate = new Set(tenant.holidays.map((h) => h.date));
    const holidays = countryCode
      ? getPublicHolidaySuggestions(countryCode, year).map((h) => ({
          ...h,
          alreadyAdded: existingByDate.has(h.date),
        }))
      : [];

    return NextResponse.json({
      success: true,
      data: {
        countryCode,
        year,
        holidays,
        availableCountries: getCountryOptions(),
      },
    });
  } catch (error: unknown) {
    logger.error('Error fetching holiday suggestions:', error);
    const message = error instanceof Error ? error.message : undefined;
    return NextResponse.json({ success: false, error: message || 'Failed to fetch holiday suggestions' }, { status: 500 });
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

    const rl = checkRateLimit(`holidays-import:${user.userId}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const { slug } = await params;
    const body = await request.json();
    const holidays = Array.isArray(body?.holidays) ? body.holidays : null;

    if (!holidays || holidays.length === 0) {
      return NextResponse.json({ success: false, error: 'holidays array is required' }, { status: 400 });
    }
    if (holidays.length > 60) {
      return NextResponse.json({ success: false, error: 'Too many holidays in one import' }, { status: 400 });
    }

    const tenant = await prisma.tenant.findFirst({ where: { slug }, include: { holidays: true } });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const existingByDate = new Set(tenant.holidays.map((h) => h.date));
    const toCreate: { id: string; name: string; date: string; isBusinessClosed: boolean }[] = [];
    for (const h of holidays) {
      if (!h || typeof h.name !== 'string' || typeof h.date !== 'string') continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(h.date)) continue;
      if (existingByDate.has(h.date)) continue; // skip duplicates (already on file, or duplicated within this request)
      existingByDate.add(h.date);
      toCreate.push({
        id: `holiday_${randomUUID()}`,
        name: h.name.slice(0, 200),
        date: h.date,
        isBusinessClosed: h.isBusinessClosed !== false,
      });
    }

    if (toCreate.length === 0) {
      return NextResponse.json({ success: true, data: [], skipped: holidays.length });
    }

    const created = await prisma.tenantHoliday.createMany({
      data: toCreate.map((h) => ({
        id: h.id,
        tenantId: tenant.id,
        name: h.name,
        date: h.date,
        type: 'single',
        isBusinessClosed: h.isBusinessClosed,
      })),
    });

    await createAuditLog(request, {
      tenantId: tenant.id,
      userId: user.userId,
      action: AuditActions.CREATE,
      entityType: 'holiday',
      entityId: 'bulk-import',
      changes: { imported: toCreate.map((h) => ({ name: h.name, date: h.date })) },
    });

    return NextResponse.json({
      success: true,
      data: toCreate,
      imported: created.count,
      skipped: holidays.length - toCreate.length,
    });
  } catch (error: unknown) {
    logger.error('Error importing holiday suggestions:', error);
    const message = error instanceof Error ? error.message : undefined;
    return NextResponse.json({ success: false, error: message || 'Failed to import holidays' }, { status: 500 });
  }
}
