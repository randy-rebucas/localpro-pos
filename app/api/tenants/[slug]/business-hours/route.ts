/**
 * Business Hours API
 * Handles CRUD operations for business hours and special hours
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getTenantBySlugAny } from '@/lib/data/tenants';

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

    const tenant = await getTenantBySlugAny(slug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const settings = (tenant.settings as Record<string, unknown>) || {};
    return NextResponse.json({
      success: true,
      data: settings.businessHours || {},
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

    if (user.role !== 'admin' && user.role !== 'manager' && user.role !== 'owner' && user.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { slug } = await params;
    const body = await request.json();
    const { schedule, specialHours, timezone } = body;

    const tenant = await getTenantBySlugAny(slug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const existingSettings = (tenant.settings as Record<string, any>) || {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    const businessHours = {
      ...existingSettings.businessHours,
      ...(timezone !== undefined && { timezone }),
      ...(schedule !== undefined && { schedule }),
      ...(specialHours !== undefined && { specialHours }),
    };

    const settings = { ...existingSettings, businessHours };
    await prisma.tenant.update({ where: { id: tenant.id }, data: { settings } });

    return NextResponse.json({
      success: true,
      data: businessHours,
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error updating business hours:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
