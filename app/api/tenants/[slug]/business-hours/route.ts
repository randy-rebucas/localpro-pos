/**
 * Business Hours API
 * Handles CRUD operations for business hours and special hours
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRepos } from '@/lib/db';
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

    const tenant = await getRepos().tenants.findBySlug(slug, { select: 'settings.businessHours' });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant._id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      data: tenant.settings?.businessHours || {},
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

    const tenant = await getRepos().tenants.findBySlug(slug, { select: 'settings.businessHours' });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant._id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const businessHours = {
      ...tenant.settings?.businessHours,
      ...(timezone !== undefined && { timezone }),
      ...(schedule !== undefined && { schedule }),
      ...(specialHours !== undefined && { specialHours }),
    };

    const updated = await getRepos().tenants.update(tenant._id, { set: { 'settings.businessHours': businessHours } });
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: updated.settings.businessHours,
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error updating business hours:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
