/**
 * Tax Rules API
 * Handles CRUD operations for regional tax rules
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
      data: tenant.settings.taxRules || [],
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Error fetching tax rules:', error);
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

    if (user.role !== 'admin' && user.role !== 'manager') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { slug } = await params;
    const body = await request.json();
    const { name, rate, label, appliesTo, categoryIds, productIds, region, priority, isActive } = body;

    if (!name || rate === undefined || !label) {
      return NextResponse.json({ success: false, error: 'Name, rate, and label are required' }, { status: 400 });
    }

    if (rate < 0 || rate > 100) {
      return NextResponse.json({ success: false, error: 'Rate must be between 0 and 100' }, { status: 400 });
    }

    await connectDB();

    const tenant = await Tenant.findOne({ slug });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const taxRules = tenant.settings.taxRules || [];
    const newRule = {
      id: `tax_rule_${Date.now()}`,
      name,
      rate,
      label,
      appliesTo: appliesTo || 'all',
      categoryIds: categoryIds || [],
      productIds: productIds || [],
      region: region || {},
      priority: priority || 0,
      isActive: isActive !== undefined ? isActive : true,
    };

    taxRules.push(newRule);

    tenant.settings.taxRules = taxRules;
    tenant.markModified('settings.taxRules');
    await tenant.save();

    return NextResponse.json({
      success: true,
      data: newRule,
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Error creating tax rule:', error);
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
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Tax rule ID is required' }, { status: 400 });
    }

    if (updates.rate !== undefined && (updates.rate < 0 || updates.rate > 100)) {
      return NextResponse.json({ success: false, error: 'Rate must be between 0 and 100' }, { status: 400 });
    }

    await connectDB();

    const tenant = await Tenant.findOne({ slug });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const taxRules = tenant.settings.taxRules || [];
    const ruleIndex = taxRules.findIndex((r: any) => r.id === id); // eslint-disable-line @typescript-eslint/no-explicit-any

    if (ruleIndex === -1) {
      return NextResponse.json({ success: false, error: 'Tax rule not found' }, { status: 404 });
    }

    taxRules[ruleIndex] = { ...taxRules[ruleIndex], ...updates };

    tenant.settings.taxRules = taxRules;
    tenant.markModified('settings.taxRules');
    await tenant.save();

    return NextResponse.json({
      success: true,
      data: taxRules[ruleIndex],
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Error updating tax rule:', error);
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

    if (user.role !== 'admin' && user.role !== 'manager') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Tax rule ID is required' }, { status: 400 });
    }

    await connectDB();

    const tenant = await Tenant.findOne({ slug });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const taxRules = tenant.settings.taxRules || [];
    const filtered = taxRules.filter((r: any) => r.id !== id); // eslint-disable-line @typescript-eslint/no-explicit-any

    if (filtered.length === taxRules.length) {
      return NextResponse.json({ success: false, error: 'Tax rule not found' }, { status: 404 });
    }

    tenant.settings.taxRules = filtered;
    tenant.markModified('settings.taxRules');
    await tenant.save();

    return NextResponse.json({ success: true });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Error deleting tax rule:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
