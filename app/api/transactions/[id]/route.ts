import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import Product from '@/models/Product';
import { requireTenantAccess } from '@/lib/api-tenant';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { updateStock } from '@/lib/stock';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
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
    const { id } = await params;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _t = await getValidationTranslatorFromRequest(request);
    
    const transaction = await Transaction.findOne({ _id: id, tenantId })
      .populate('items.product', 'name sku')
      .populate('userId', 'name email')
      .lean();
    
    if (!transaction) {
      return NextResponse.json({ success: false, error: t('validation.transactionNotFound', 'Transaction not found') }, { status: 404 });
    }
    
    return NextResponse.json({ success: true, data: transaction });
  } catch (error: unknown) {
    const t = await getValidationTranslatorFromRequest(request);
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ success: false, error: t('validation.unauthorized', 'Unauthorized') }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    // SECURITY: Validate tenant access for authenticated requests
    let tenantId: string;
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
      // Also check role
      await requireRole(request, ['admin', 'manager']);
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
    const { id } = await params;
    const body = await request.json();
    const t = await getValidationTranslatorFromRequest(request);

    const transaction = await Transaction.findOne({ _id: id, tenantId });
    if (!transaction) {
      return NextResponse.json({ success: false, error: t('validation.transactionNotFound', 'Transaction not found') }, { status: 404 });
    }

    // Only allow status updates
    if (body.status && ['cancelled', 'refunded'].includes(body.status)) {
      const oldStatus = transaction.status;
      transaction.status = body.status;
      await transaction.save();

      // If refunding, restore stock (only if product tracks inventory)
      if (body.status === 'refunded' && oldStatus === 'completed') {
        for (const item of transaction.items) {
          const product = await Product.findOne({ _id: item.product.toString(), tenantId });
          if (product && product.trackInventory !== false) {
            await updateStock(
              item.product.toString(),
              tenantId,
              item.quantity, // Positive to restore
              'return',
              {
                transactionId: transaction._id.toString(),
                reason: 'Transaction refund',
              }
            );
          }
        }
      }

      await createAuditLog(request, {
        tenantId,
        action: body.status === 'refunded' ? AuditActions.TRANSACTION_REFUND : AuditActions.TRANSACTION_CANCEL,
        entityType: 'transaction',
        entityId: id,
        changes: { status: { old: oldStatus, new: body.status } },
      });
    }

    if (body.notes !== undefined) {
      transaction.notes = body.notes;
      await transaction.save();
    }

    return NextResponse.json({ success: true, data: transaction });
  } catch (error: unknown) {
    if (error.message === 'Unauthorized' || error.message.includes('Forbidden')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

