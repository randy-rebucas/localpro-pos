/**
 * Business Hours API
 * Handles CRUD operations for business hours and special hours
 */

import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { getCurrentUser } from '@/lib/auth';

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

    return NextResponse.json({
      success: true,
      data: tenant.settings.businessHours || {},
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Error fetching business hours:', error);
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

    if (user.role !== 'admin' && user.role !== 'manager') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { slug } = await params;
    const body = await request.json();
    const { schedule, specialHours, timezone } = body;

    await connectDB();

    const tenant = await Tenant.findOne({ slug });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    tenant.settings.businessHours = {
      ...tenant.settings.businessHours,
      ...(timezone !== undefined && { timezone }),
      ...(schedule !== undefined && { schedule }),
      ...(specialHours !== undefined && { specialHours }),
    };

    tenant.markModified('settings.businessHours');
    await tenant.save();

    return NextResponse.json({
      success: true,
      data: tenant.settings.businessHours,
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Error updating business hours:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
