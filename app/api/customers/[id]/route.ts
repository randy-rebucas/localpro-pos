import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { parseCreditLimitInput } from '@/lib/customer-credit';
import { customerToApi } from '@/lib/data/customers';

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

    const customer = await prisma.customer.findFirst({ where: { id, tenantId, isActive: true } });

    if (!customer) {
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: customerToApi(customer) });
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

    const customer = await prisma.customer.findFirst({ where: { id, tenantId } });

    if (!customer) {
      return NextResponse.json({ success: false, error: t('validation.customerNotFound', 'Customer not found') }, { status: 404 });
    }

    const body = await request.json();
    const oldData = {
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      creditLimit: customer.creditLimit ? Number(customer.creditLimit) : null,
    };

    const updates: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any

    if (body.firstName !== undefined) updates.firstName = body.firstName.trim();
    if (body.lastName !== undefined) updates.lastName = body.lastName.trim();
    if (body.email !== undefined) {
      const email = body.email.toLowerCase().trim();
      if (email && email !== customer.email) {
        const existingCustomer = await prisma.customer.findFirst({ where: { tenantId, email, id: { not: id } } });
        if (existingCustomer) {
          return NextResponse.json(
            { success: false, error: t('validation.emailAlreadyExists', 'Email already exists') },
            { status: 400 }
          );
        }
      }
      updates.email = email;
    }
    if (body.phone !== undefined) updates.phone = body.phone?.trim();
    if (body.addresses !== undefined) updates.addresses = body.addresses;
    if (body.dateOfBirth !== undefined) updates.dateOfBirth = body.dateOfBirth ? new Date(body.dateOfBirth) : null;
    if (body.notes !== undefined) updates.notes = body.notes?.trim();
    if (body.tags !== undefined) updates.tags = body.tags;
    if (body.isActive !== undefined) updates.isActive = body.isActive;
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
        updates.creditLimit = null;
      } else {
        updates.creditLimit = cl;
      }
    }

    const updatedCustomer = await prisma.customer.update({ where: { id }, data: updates });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'customer',
      entityId: updatedCustomer.id,
      changes: {
        old: oldData,
        new: {
          firstName: updatedCustomer.firstName,
          lastName: updatedCustomer.lastName,
          email: updatedCustomer.email,
          creditLimit: updatedCustomer.creditLimit ? Number(updatedCustomer.creditLimit) : null,
        },
      },
    });

    return NextResponse.json({ success: true, data: customerToApi(updatedCustomer) });
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
    const customer = await prisma.customer.findFirst({ where: { id, tenantId } });

    if (!customer) {
      return NextResponse.json({ success: false, error: t('validation.customerNotFound', 'Customer not found') }, { status: 404 });
    }

    await prisma.customer.update({ where: { id }, data: { isActive: false } });

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
