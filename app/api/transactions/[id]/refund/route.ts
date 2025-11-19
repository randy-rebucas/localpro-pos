import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { updateStock } from '@/lib/stock';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    if (transaction.status === 'refunded') {
      return NextResponse.json(
        { success: false, error: 'Transaction has already been refunded' },
        { status: 400 }
      );
    }

    if (transaction.status !== 'completed') {
      return NextResponse.json(
        { success: false, error: 'Only completed transactions can be refunded' },
        { status: 400 }
      );
    }

    const { items, reason, notes } = body;

    // If no items specified, refund all items (full refund)
    const itemsToRefund = items || transaction.items.map((item: any) => ({
      productId: item.product.toString(),
      quantity: item.quantity,
    }));

    // Validate items to refund
    const refundItems = [];
    let refundAmount = 0;

    for (const refundItem of itemsToRefund) {
      const originalItem = transaction.items.find(
        (item: any) => item.product.toString() === refundItem.productId
      );

      if (!originalItem) {
        return NextResponse.json(
          { success: false, error: `Item ${refundItem.productId} not found in transaction` },
          { status: 400 }
        );
      }

      if (refundItem.quantity > originalItem.quantity) {
        return NextResponse.json(
          { success: false, error: `Cannot refund more than purchased quantity` },
          { status: 400 }
        );
      }

      refundItems.push({
        productId: refundItem.productId,
        quantity: refundItem.quantity,
        price: originalItem.price,
        subtotal: originalItem.price * refundItem.quantity,
      });

      refundAmount += originalItem.price * refundItem.quantity;
    }

    // Calculate proportional discount refund if applicable
    if (transaction.discountAmount && transaction.discountAmount > 0) {
      const discountRatio = refundAmount / transaction.subtotal;
      const refundDiscount = transaction.discountAmount * discountRatio;
      refundAmount -= refundDiscount;
    }

    // Create refund transaction
    const refundTransaction = await Transaction.create({
      tenantId,
      items: refundItems.map((item: any) => ({
        product: item.productId,
        name: transaction.items.find((i: any) => i.product.toString() === item.productId)?.name || '',
        price: item.price,
        quantity: item.quantity,
        subtotal: item.subtotal,
      })),
      subtotal: refundAmount,
      total: refundAmount,
      paymentMethod: transaction.paymentMethod,
      status: 'refunded',
      receiptNumber: `REF-${transaction.receiptNumber || transaction._id.toString().slice(-8)}`,
      notes: notes || reason || 'Refund',
    });

    // Restore stock for refunded items
    for (const refundItem of refundItems) {
      await updateStock(
        refundItem.productId,
        tenantId,
        refundItem.quantity, // Positive to restore
        'return',
        {
          transactionId: refundTransaction._id.toString(),
          reason: reason || 'Transaction refund',
          notes: notes,
        }
      );
    }

    // Mark original transaction as refunded if full refund
    const isFullRefund = refundItems.length === transaction.items.length &&
      refundItems.every((item: any) => {
        const original = transaction.items.find((i: any) => i.product.toString() === item.productId);
        return original && item.quantity === original.quantity;
      });

    if (isFullRefund) {
      transaction.status = 'refunded';
      await transaction.save();
    }

    await createAuditLog(request, {
      action: AuditActions.TRANSACTION_REFUND,
      entityType: 'transaction',
      entityId: id,
      changes: {
        refundTransactionId: refundTransaction._id.toString(),
        refundAmount,
        itemsRefunded: refundItems.length,
        isFullRefund,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        refundTransaction,
        originalTransaction: transaction,
        refundAmount,
        isFullRefund,
      },
    }, { status: 201 });
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

