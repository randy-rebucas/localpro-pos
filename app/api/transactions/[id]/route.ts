import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import Product from '@/models/Product';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth, requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { updateStock } from '@/lib/stock';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }
    
    const transaction = await Transaction.findOne({ _id: id, tenantId })
      .populate('items.product', 'name sku')
      .populate('userId', 'name email')
      .lean();
    
    if (!transaction) {
      return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 });
    }
    
    return NextResponse.json({ success: true, data: transaction });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    await requireRole(request, ['admin', 'manager']);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    const body = await request.json();
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const transaction = await Transaction.findOne({ _id: id, tenantId });
    if (!transaction) {
      return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 });
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
  } catch (error: any) {
    if (error.message === 'Unauthorized' || error.message.includes('Forbidden')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

