import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Customer from '@/models/Customer';
import { getTenantIdFromRequest, requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;
    const tenantId = await getTenantIdFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found or access denied' }, { status: 403 });
    }
    
    const customer = await Customer.findOne({ _id: id, tenantId }).lean();
    
    if (!customer) {
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
    }
    
    return NextResponse.json({ success: true, data: customer });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch customer';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;
    // SECURITY: Validate tenant access for authenticated requests
    let tenantId: string;
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
    } catch (authError: unknown) {
      if (authError instanceof Error && (authError.message.includes('Unauthorized') || authError.message.includes('Forbidden'))) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _t = await getValidationTranslatorFromRequest(request);
        return NextResponse.json(
          { success: false, error: authError.message },
          { status: authError.message.includes('Unauthorized') ? 401 : 403 }
        );
      }
      throw authError;
    }
    const t = await getValidationTranslatorFromRequest(request);
    
    const customer = await Customer.findOne({ _id: id, tenantId });
    
    if (!customer) {
      return NextResponse.json({ success: false, error: t('validation.customerNotFound', 'Customer not found') }, { status: 404 });
    }
    
    const body = await request.json();
    const oldData = { firstName: customer.firstName, lastName: customer.lastName, email: customer.email };
    
    if (body.firstName !== undefined) customer.firstName = body.firstName.trim();
    if (body.lastName !== undefined) customer.lastName = body.lastName.trim();
    if (body.email !== undefined) {
      const email = body.email.toLowerCase().trim();
      if (email && email !== customer.email) {
        const existingCustomer = await Customer.findOne({ tenantId, email, _id: { $ne: id } });
        if (existingCustomer) {
          return NextResponse.json(
            { success: false, error: t('validation.emailAlreadyExists', 'Email already exists') },
            { status: 400 }
          );
        }
      }
      customer.email = email;
    }
    if (body.phone !== undefined) customer.phone = body.phone?.trim();
    if (body.addresses !== undefined) customer.addresses = body.addresses;
    if (body.dateOfBirth !== undefined) customer.dateOfBirth = body.dateOfBirth ? new Date(body.dateOfBirth) : undefined;
    if (body.notes !== undefined) customer.notes = body.notes?.trim();
    if (body.tags !== undefined) customer.tags = body.tags;
    if (body.isActive !== undefined) customer.isActive = body.isActive;
    
    await customer.save();
    
    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'customer',
      entityId: customer._id.toString(),
      changes: { old: oldData, new: { firstName: customer.firstName, lastName: customer.lastName, email: customer.email } },
    });
    
    return NextResponse.json({ success: true, data: customer });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update customer';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;
    // SECURITY: Validate tenant access for authenticated requests
    let tenantId: string;
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
    } catch (authError: unknown) {
      if (authError instanceof Error && (authError.message.includes('Unauthorized') || authError.message.includes('Forbidden'))) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _t = await getValidationTranslatorFromRequest(request);
        return NextResponse.json(
          { success: false, error: authError.message },
          { status: authError.message.includes('Unauthorized') ? 401 : 403 }
        );
      }
      throw authError;
    }
    const t = await getValidationTranslatorFromRequest(request);
    
    // Soft delete - set isActive to false
    const customer = await Customer.findOne({ _id: id, tenantId });
    
    if (!customer) {
      return NextResponse.json({ success: false, error: t('validation.customerNotFound', 'Customer not found') }, { status: 404 });
    }
    
    customer.isActive = false;
    await customer.save();
    
    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DELETE,
      entityType: 'customer',
      entityId: id,
      changes: { name: `${customer.firstName} ${customer.lastName}` },
    });
    
    return NextResponse.json({ success: true, message: 'Customer deleted' });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update customer';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 400 });
  }
}
