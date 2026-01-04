/**
 * Holidays API
 * Handles CRUD operations for holiday calendar
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
      data: tenant.settings.holidays || [],
    });
  } catch (error: unknown) {
    console.error('Error fetching holidays:', error);
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

    await connectDB();

    const tenant = await Tenant.findOne({ slug });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const holidays = tenant.settings.holidays || [];
    const newHoliday: { id: string; name: string; date: Date; recurringPattern?: string; isRecurring?: boolean } = {
      id: `holiday_${Date.now()}`,
      name,
      type,
      isBusinessClosed: isBusinessClosed !== undefined ? isBusinessClosed : true,
      createdAt: new Date(),
    };

    // Add date for single holidays, or recurring pattern for recurring holidays
    if (type === 'single') {
      newHoliday.date = date;
    } else if (type === 'recurring') {
      newHoliday.recurring = recurring;
      // For recurring holidays, we can use a placeholder date or pattern-based date
      newHoliday.date = recurring?.month && recurring?.dayOfMonth 
        ? `${new Date().getFullYear()}-${String(recurring.month).padStart(2, '0')}-${String(recurring.dayOfMonth).padStart(2, '0')}`
        : '';
    }

    holidays.push(newHoliday);

    tenant.settings.holidays = holidays;
    tenant.markModified('settings.holidays');
    
    try {
      await tenant.save();
      console.log('Holiday saved successfully:', newHoliday);
    } catch (saveError: unknown) {
      console.error('Error saving holiday to database:', saveError);
      return NextResponse.json({ 
        success: false, 
        error: `Failed to save holiday: ${saveError instanceof Error ? saveError.message : 'Database error'}` 
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: newHoliday,
    });
  } catch (error: unknown) {
    console.error('Error creating holiday:', error);
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
      return NextResponse.json({ success: false, error: 'Holiday ID is required' }, { status: 400 });
    }

    await connectDB();

    const tenant = await Tenant.findOne({ slug });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const holidays = tenant.settings.holidays || [];
    const holidayIndex = holidays.findIndex((h: unknown) => h.id === id);

    if (holidayIndex === -1) {
      return NextResponse.json({ success: false, error: 'Holiday not found' }, { status: 404 });
    }

    holidays[holidayIndex] = { ...holidays[holidayIndex], ...updates };

    tenant.settings.holidays = holidays;
    tenant.markModified('settings.holidays');
    
    try {
      await tenant.save();
      console.log('Holiday updated successfully:', holidays[holidayIndex]);
    } catch (saveError: unknown) {
      console.error('Error saving holiday update to database:', saveError);
      return NextResponse.json({ 
        success: false, 
        error: `Failed to update holiday: ${saveError instanceof Error ? saveError.message : 'Database error'}` 
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: holidays[holidayIndex],
    });
  } catch (error: unknown) {
    console.error('Error updating holiday:', error);
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
      return NextResponse.json({ success: false, error: 'Holiday ID is required' }, { status: 400 });
    }

    await connectDB();

    const tenant = await Tenant.findOne({ slug });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const holidays = tenant.settings.holidays || [];
    const filtered = holidays.filter((h: unknown) => h.id !== id);

    if (filtered.length === holidays.length) {
      return NextResponse.json({ success: false, error: 'Holiday not found' }, { status: 404 });
    }

    tenant.settings.holidays = filtered;
    tenant.markModified('settings.holidays');
    
    try {
      await tenant.save();
      console.log('Holiday deleted successfully');
    } catch (saveError: unknown) {
      console.error('Error saving holiday deletion to database:', saveError);
      return NextResponse.json({ 
        success: false, 
        error: `Failed to delete holiday: ${saveError instanceof Error ? saveError.message : 'Database error'}` 
      }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error deleting holiday:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
