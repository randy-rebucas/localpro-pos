import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { parseCreditLimitInput } from '@/lib/customer-credit';

function toCustomerJSON(c: { addresses: Array<{ id: string; street: string | null; city: string | null; state: string | null; zipCode: string | null; country: string | null; isDefault: boolean }>; totalSpent: unknown; loyaltyPointsBalance: unknown; accountBalance: unknown; creditLimit: unknown; id: string; [key: string]: unknown }) {
  const { addresses, ...rest } = c;
  return {
    ...rest,
    _id: c.id,
    totalSpent: Number(c.totalSpent),
    loyaltyPointsBalance: Number(c.loyaltyPointsBalance),
    accountBalance: Number(c.accountBalance),
    creditLimit: c.creditLimit != null ? Number(c.creditLimit as number) : undefined,
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Require authentication to prevent unauthenticated customer lookups
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const tenantId = authResult.tenantId;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found or access denied' }, { status: 403 });
    }

    const customer = await prisma.customer.findFirst({
      where: { id, tenantId, isActive: { not: false } },
      include: { addresses: true },
    });

    if (!customer) {
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: toCustomerJSON(customer) });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch customer');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // SECURITY: Validate tenant access for authenticated requests
    let tenantId: string;
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
      if (!(await hasTenantPermission(tenantAccess.user.role, tenantId, 'customers.edit'))) {
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

    const existing = await prisma.customer.findFirst({ where: { id, tenantId } });

    if (!existing) {
      return NextResponse.json({ success: false, error: t('validation.customerNotFound', 'Customer not found') }, { status: 404 });
    }

    const body = await request.json();
    const oldData = {
      firstName: existing.firstName,
      lastName: existing.lastName,
      email: existing.email,
      creditLimit: existing.creditLimit != null ? Number(existing.creditLimit) : null,
    };

    const data: Record<string, unknown> = {};
    if (body.firstName !== undefined) data.firstName = body.firstName.trim();
    if (body.lastName !== undefined) data.lastName = body.lastName.trim();
    if (body.email !== undefined) {
      const email = body.email.toLowerCase().trim();
      if (email && email !== existing.email) {
        const existingCustomer = await prisma.customer.findFirst({ where: { tenantId, email, id: { not: id } } });
        if (existingCustomer) {
          return NextResponse.json(
            { success: false, error: t('validation.emailAlreadyExists', 'Email already exists') },
            { status: 400 }
          );
        }
      }
      data.email = email;
    }
    if (body.phone !== undefined) data.phone = body.phone?.trim();
    if (body.addresses !== undefined) {
      data.addresses = {
        deleteMany: {},
        create: (body.addresses || []).map((a: { street?: string; city?: string; state?: string; zipCode?: string; country?: string; isDefault?: boolean }) => ({
          id: randomUUID(),
          street: a.street,
          city: a.city,
          state: a.state,
          zipCode: a.zipCode,
          country: a.country,
          isDefault: a.isDefault ?? false,
        })),
      };
    }
    if (body.dateOfBirth !== undefined) data.dateOfBirth = body.dateOfBirth ? new Date(body.dateOfBirth) : null;
    if (body.notes !== undefined) data.notes = body.notes?.trim();
    if (body.tags !== undefined) data.tags = body.tags;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.creditLimit !== undefined) {
      const cl = parseCreditLimitInput(body.creditLimit);
      if (cl === undefined) {
        // no-op
      } else if (Number.isNaN(cl)) {
        return NextResponse.json(
          { success: false, error: t('validation.creditLimitInvalid', 'Credit limit must be a non-negative number or empty to clear') },
          { status: 400 }
        );
      } else if (cl === null) {
        data.creditLimit = null;
      } else {
        data.creditLimit = cl;
      }
    }

    const customer = await prisma.customer.update({
      where: { id },
      data,
      include: { addresses: true },
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'customer',
      entityId: customer.id,
      changes: {
        old: oldData,
        new: {
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          creditLimit: customer.creditLimit != null ? Number(customer.creditLimit) : null,
        },
      },
    });

    return NextResponse.json({ success: true, data: toCustomerJSON(customer) });
  } catch (error) {
    return handleApiError(error, 'Failed to update customer');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // SECURITY: Validate tenant access for authenticated requests
    let tenantId: string;
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
      if (!(await hasTenantPermission(tenantAccess.user.role, tenantId, 'customers.edit'))) {
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

    // Soft delete - set isActive to false
    const existing = await prisma.customer.findFirst({ where: { id, tenantId } });

    if (!existing) {
      return NextResponse.json({ success: false, error: t('validation.customerNotFound', 'Customer not found') }, { status: 404 });
    }

    const customer = await prisma.customer.update({ where: { id }, data: { isActive: false } });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DELETE,
      entityType: 'customer',
      entityId: id,
      changes: { name: `${customer.firstName} ${customer.lastName}` },
    });
    
    return NextResponse.json({ success: true, message: 'Customer deleted' });
  } catch (error) {
    return handleApiError(error, 'Failed to delete customer');
  }
}
