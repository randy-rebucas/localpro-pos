import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Customer from '@/models/Customer';
import { getTenantIdFromRequest, requireTenantAccess } from '@/lib/api-tenant';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { requireAuth as _requireAuth } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const tenantId = await getTenantIdFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found or access denied' }, { status: 403 });
    }
    
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50');
    const page = parseInt(searchParams.get('page') || '1');
    const skip = (page - 1) * limit;
    const search = searchParams.get('search');
    const isActive = searchParams.get('isActive');
    
    const query: Record<string, unknown> = { tenantId };
    if (isActive !== null) {
      query.isActive = isActive === 'true';
    }
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
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
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch customers';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
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
    } catch (authError: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _t = await getValidationTranslatorFromRequest(request);
      const authErrorMessage = authError instanceof Error ? authError.message : 'Authentication error';
      if (authErrorMessage.includes('Unauthorized') || authErrorMessage.includes('Forbidden')) {
        return NextResponse.json(
          { success: false, error: authErrorMessage },
          { status: authErrorMessage.includes('Unauthorized') ? 401 : 403 }
        );
      }
      throw authError;
    }
    const t = await getValidationTranslatorFromRequest(request);
    
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
          console.error('Failed to send welcome email:', error);
        });
      } catch (error) {
        // Silently fail - welcome email shouldn't block customer creation
        console.error('Error importing welcome email automation:', error);
      }
    }
    
    return NextResponse.json({ success: true, data: customer }, { status: 201 });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create customer';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 400 });
  }
}
