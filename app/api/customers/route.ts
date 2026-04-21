import { NextRequest, NextResponse } from 'next/server';
import type { FilterQuery } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Customer, { type ICustomer } from '@/models/Customer';
import { getTenantIdFromRequest, requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';
import { checkFeatureAccess } from '@/lib/subscription';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const tenantId = await getTenantIdFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found or access denied' }, { status: 403 });
    }
    
    const searchParams = request.nextUrl.searchParams;
    const rawLimit = parseInt(searchParams.get('limit') || '50');
    const limit = Math.min(Math.max(1, rawLimit), 200);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const skip = (page - 1) * limit;
    const search = searchParams.get('search');
    const isActive = searchParams.get('isActive');

    const query: FilterQuery<ICustomer> = { tenantId };
    if (searchParams.has('isActive')) {
      query.isActive = isActive === 'true';
    }
    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { firstName: { $regex: escapedSearch, $options: 'i' } },
        { lastName: { $regex: escapedSearch, $options: 'i' } },
        { email: { $regex: escapedSearch, $options: 'i' } },
        { phone: { $regex: escapedSearch, $options: 'i' } },
      ];
    }
    
    const customers = await Customer.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();
    
    const total = await Customer.countDocuments(query);
    
    return NextResponse.json({
      success: true,
      data: customers,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch customers');
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    // SECURITY: Validate tenant access for authenticated requests
    let tenantId: string;
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
    } catch (authError: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      const t = await getValidationTranslatorFromRequest(request); // eslint-disable-line @typescript-eslint/no-unused-vars
      if (authError.message.includes('Unauthorized') || authError.message.includes('Forbidden')) {
        return NextResponse.json(
          { success: false, error: authError.message },
          { status: authError.message.includes('Unauthorized') ? 401 : 403 }
        );
      }
      throw authError;
    }
    const t = await getValidationTranslatorFromRequest(request);

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:customers:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    // Check if customer management feature is enabled in subscription
    try {
      await checkFeatureAccess(tenantId.toString(), 'enableCustomerManagement');
    } catch (featureError: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      return NextResponse.json(
        { success: false, error: featureError.message },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { firstName, lastName, email, phone, addresses, dateOfBirth, notes, tags } = body;

    // Validate required fields
    if (!firstName || !firstName.trim()) {
      return NextResponse.json(
        { success: false, error: t('validation.firstNameRequired', 'First name is required') },
        { status: 400 }
      );
    }
    
    if (!lastName || !lastName.trim()) {
      return NextResponse.json(
        { success: false, error: t('validation.lastNameRequired', 'Last name is required') },
        { status: 400 }
      );
    }
    
    // Check email uniqueness if provided
    if (email) {
      const existingCustomer = await Customer.findOne({ tenantId, email: email.toLowerCase() });
      if (existingCustomer) {
        return NextResponse.json(
          { success: false, error: t('validation.emailAlreadyExists', 'Email already exists') },
          { status: 400 }
        );
      }
    }
    
    const customer = await Customer.create({
      tenantId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email?.toLowerCase().trim(),
      phone: phone?.trim(),
      addresses: addresses || [],
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      notes: notes?.trim(),
      tags: tags || [],
      isActive: true,
    });
    
    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'customer',
      entityId: customer._id.toString(),
      changes: { firstName, lastName, email },
    });

    // Send welcome email (#22 - New Customer Welcome Emails)
    if (customer.email) {
      try {
        const { sendCustomerWelcomeEmail } = await import('@/lib/automations/customer-welcome');
        sendCustomerWelcomeEmail({
          customerId: customer._id.toString(),
          tenantId,
        }).catch((error) => {
          // Log error but don't fail customer creation
          logger.error('Failed to send welcome email:', error);
        });
      } catch (error) {
        // Silently fail - welcome email shouldn't block customer creation
        logger.error('Error importing welcome email automation:', error);
      }
    }
    
    return NextResponse.json({ success: true, data: customer }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Failed to create customer');
  }
}
