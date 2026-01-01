import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Customer from '@/models/Customer';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
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
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }
    
    const customer = await Customer.findOne({ _id: id, tenantId }).lean();
    
    if (!customer) {
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
    }
    
    return NextResponse.json({ success: true, data: customer });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }
    
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
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }
    
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
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
