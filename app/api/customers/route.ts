import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';
import { checkFeatureAccess } from '@/lib/subscription';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { parseCreditLimitInput } from '@/lib/customer-credit';

function toCustomerJSON(c: Prisma.CustomerGetPayload<{ include: { addresses: true } }>) {
  const { addresses, ...rest } = c;
  return {
    ...rest,
    _id: c.id,
    totalSpent: Number(c.totalSpent),
    loyaltyPointsBalance: Number(c.loyaltyPointsBalance),
    accountBalance: Number(c.accountBalance),
    creditLimit: c.creditLimit != null ? Number(c.creditLimit) : undefined,
    addresses: addresses.map((a) => ({
      _id: a.id,
      street: a.street ?? undefined,
      city: a.city ?? undefined,
      state: a.state ?? undefined,
      zipCode: a.zipCode ?? undefined,
      country: a.country ?? undefined,
      isDefault: a.isDefault,
    })),
  };
}

export async function GET(request: NextRequest) {
  try {
    // Require authentication to prevent unauthenticated customer enumeration
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const tenantId = authResult.tenantId;

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

    const where: Prisma.CustomerWhereInput = { tenantId };
    if (searchParams.has('isActive')) {
      where.isActive = isActive === 'true';
    }
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const customers = await prisma.customer.findMany({
      where,
      include: { addresses: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip,
    });

    const total = await prisma.customer.count({ where });

    return NextResponse.json({
      success: true,
      data: customers.map(toCustomerJSON),
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
    // SECURITY: Validate tenant access for authenticated requests
    let tenantId: string;
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
      if (!(await hasTenantPermission(tenantAccess.user.role, tenantId, 'customers.manage'))) {
        return NextResponse.json(
          { success: false, error: 'Forbidden: Insufficient permissions' },
          { status: 403 }
        );
      }
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
    const { firstName, lastName, email, phone, addresses, dateOfBirth, notes, tags, creditLimit } = body;

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
      const existingCustomer = await prisma.customer.findFirst({ where: { tenantId, email: email.toLowerCase() } });
      if (existingCustomer) {
        return NextResponse.json(
          { success: false, error: t('validation.emailAlreadyExists', 'Email already exists') },
          { status: 400 }
        );
      }
    }
    
    let parsedCreditLimit: number | undefined;
    if (creditLimit !== undefined) {
      const cl = parseCreditLimitInput(creditLimit);
      if (Number.isNaN(cl)) {
        return NextResponse.json(
          { success: false, error: t('validation.creditLimitInvalid', 'Credit limit must be a non-negative number or empty to clear') },
          { status: 400 }
        );
      }
      if (typeof cl === 'number') {
        parsedCreditLimit = cl;
      }
    }

    const customer = await prisma.customer.create({
      data: {
        id: randomUUID(),
        tenantId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email?.toLowerCase().trim(),
        phone: phone?.trim(),
        addresses: {
          create: (addresses || []).map((a: { street?: string; city?: string; state?: string; zipCode?: string; country?: string; isDefault?: boolean }) => ({
            id: randomUUID(),
            street: a.street,
            city: a.city,
            state: a.state,
            zipCode: a.zipCode,
            country: a.country,
            isDefault: a.isDefault ?? false,
          })),
        },
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        notes: notes?.trim(),
        tags: tags || [],
        creditLimit: parsedCreditLimit,
        isActive: true,
      },
      include: { addresses: true },
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'customer',
      entityId: customer.id,
      changes: { firstName, lastName, email, creditLimit: customer.creditLimit != null ? Number(customer.creditLimit) : null },
    });

    // Send welcome email (#22 - New Customer Welcome Emails)
    if (customer.email) {
      try {
        const { sendCustomerWelcomeEmail } = await import('@/lib/automations/customer-welcome');
        sendCustomerWelcomeEmail({
          customerId: customer.id,
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

    return NextResponse.json({ success: true, data: toCustomerJSON(customer) }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Failed to create customer');
  }
}
