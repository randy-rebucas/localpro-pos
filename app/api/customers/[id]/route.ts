import { NextRequest, NextResponse } from 'next/server';
import { getRepos, type Customer, type CustomerFields, type Patch } from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { parseCreditLimitInput } from '@/lib/customer-credit';

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

    const customer = await getRepos().customers.findOne(tenantId, { ids: [id], notDisabled: true });

    if (!customer) {
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
    }
    
    return NextResponse.json({ success: true, data: customer });
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

    const { customers } = getRepos();
    const customer = await customers.findById(tenantId, id);

    if (!customer) {
      return NextResponse.json({ success: false, error: t('validation.customerNotFound', 'Customer not found') }, { status: 404 });
    }

    const body = await request.json();
    // `null` clears a field (what assigning undefined to the document did)
    const patch: Patch<CustomerFields> = {};

    if (body.firstName !== undefined) patch.firstName = body.firstName.trim();
    if (body.lastName !== undefined) patch.lastName = body.lastName.trim();
    if (body.email !== undefined) {
      const email = body.email.toLowerCase().trim();
      if (email && email !== customer.email) {
        const existingCustomer = await customers.findOne(tenantId, { email, excludeId: id });
        if (existingCustomer) {
          return NextResponse.json(
            { success: false, error: t('validation.emailAlreadyExists', 'Email already exists') },
            { status: 400 }
          );
        }
      }
      patch.email = email;
    }
    if (body.phone !== undefined) patch.phone = body.phone?.trim() ?? null;
    if (body.addresses !== undefined) patch.addresses = body.addresses;
    if (body.dateOfBirth !== undefined) patch.dateOfBirth = body.dateOfBirth ? new Date(body.dateOfBirth) : null;
    if (body.notes !== undefined) patch.notes = body.notes?.trim() ?? null;
    if (body.tags !== undefined) patch.tags = body.tags;
    if (body.isActive !== undefined) patch.isActive = body.isActive;
    if (body.creditLimit !== undefined) {
      const cl = parseCreditLimitInput(body.creditLimit);
      if (cl === undefined) {
        // no-op
      } else if (Number.isNaN(cl)) {
        return NextResponse.json(
          { success: false, error: t('validation.creditLimitInvalid', 'Credit limit must be a non-negative number or empty to clear') },
          { status: 400 }
        );
      } else {
        patch.creditLimit = cl;
      }
    }

    const result = await customers.update(tenantId, id, patch);
    if (!result) {
      return NextResponse.json({ success: false, error: t('validation.customerNotFound', 'Customer not found') }, { status: 404 });
    }
    const summary = (c: Customer) => ({
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      creditLimit: c.creditLimit ?? null,
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'customer',
      entityId: id,
      changes: { old: summary(result.before), new: summary(result.after) },
    });

    return NextResponse.json({ success: true, data: result.after });
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
    const result = await getRepos().customers.update(tenantId, id, { isActive: false });

    if (!result) {
      return NextResponse.json({ success: false, error: t('validation.customerNotFound', 'Customer not found') }, { status: 404 });
    }
    const customer = result.after;

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
