import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import Payment from '@/models/Payment';
import Product from '@/models/Product';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireRole, getCurrentUser } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { updateStock } from '@/lib/stock';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    await requireRole(request, ['admin', 'manager']);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    const body = await request.json();
    const t = await getValidationTranslatorFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const transaction = await Transaction.findOne({ _id: id, tenantId });
    if (!transaction) {
      return NextResponse.json({ success: false, error: t('validation.transactionNotFound', 'Transaction not found') }, { status: 404 });
    }

    if (transaction.status === 'refunded') {
      return NextResponse.json(
        { success: false, error: t('validation.transactionAlreadyRefunded', 'Transaction has already been refunded') },
        { status: 400 }
      );
    }

    if (transaction.status !== 'completed') {
      return NextResponse.json(
        { success: false, error: t('validation.onlyCompletedRefundable', 'Only completed transactions can be refunded') },
        { status: 400 }
      );
    }

    const { items, reason, notes } = body;

    // If no items specified, refund all items (full refund)
    const itemsToRefund = items || transaction.items.map((item: unknown) => ({
      productId: item.product.toString(),
      quantity: item.quantity,
    }));

    // Validate items to refund
    const refundItems = [];
    let refundAmount = 0;

    for (const refundItem of itemsToRefund) {
      const originalItem = transaction.items.find(
        (item: { product: { toString: () => string } }) => item.product.toString() === refundItem.productId
      );

      if (!originalItem) {
        const errorMsg = t('validation.itemNotFoundInTransaction', 'Item {productId} not found in transaction').replace('{productId}', refundItem.productId);
        return NextResponse.json(
          { success: false, error: errorMsg },
          { status: 400 }
        );
      }

      if (refundItem.quantity > originalItem.quantity) {
        return NextResponse.json(
          { success: false, error: t('validation.cannotRefundMoreThanPurchased', 'Cannot refund more than purchased quantity') },
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
      items: refundItems.map((item: unknown) => ({
        product: item.productId,
        name: transaction.items.find((i: { product: { toString: () => string }; name?: string }) => i.product.toString() === item.productId)?.name || '',
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

    // Restore stock for refunded items (only if product tracks inventory)
    for (const refundItem of refundItems) {
      const product = await Product.findOne({ _id: refundItem.productId, tenantId });
      if (product && product.trackInventory !== false) {
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
    }

    // Mark original transaction as refunded if full refund
    const isFullRefund = refundItems.length === transaction.items.length &&
      refundItems.every((item: { productId: string; quantity: number }) => {
        const original = transaction.items.find((i: { product: { toString: () => string }; quantity: number }) => i.product.toString() === item.productId);
        return original && item.quantity === original.quantity;
      });

    if (isFullRefund) {
      transaction.status = 'refunded';
      await transaction.save();
    }

    // Create Payment refund record if original payment exists
    let refundPayment = null;
    try {
      const originalPayment = await Payment.findOne({
        tenantId,
        transactionId: transaction._id,
        status: 'completed',
      });

      if (originalPayment) {
        const user = await getCurrentUser(request);
        refundPayment = await Payment.create({
          tenantId,
          transactionId: refundTransaction._id,
          method: originalPayment.method,
          amount: refundAmount,
          status: 'refunded',
          details: originalPayment.details,
          processedBy: user?.userId,
          processedAt: new Date(),
          refundedAt: new Date(),
          refundReason: body.reason || body.notes || 'Transaction refund',
        });

        // Mark original payment as refunded
        originalPayment.status = 'refunded';
        originalPayment.refundedAt = new Date();
        originalPayment.refundReason = body.reason || body.notes || 'Transaction refund';
        await originalPayment.save();
      }
    } catch (paymentError) {
      // Log error but don't fail refund - payment record refund is optional
      console.error('Failed to create payment refund record:', paymentError);
    }

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.TRANSACTION_REFUND,
      entityType: 'transaction',
      entityId: id,
      changes: {
        refundTransactionId: refundTransaction._id.toString(),
        refundAmount,
        itemsRefunded: refundItems.length,
        isFullRefund,
        refundPaymentId: refundPayment?._id.toString(),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        refundTransaction,
        originalTransaction: transaction,
        refundAmount,
        isFullRefund,
        refundPayment,
      },
    }, { status: 201 });
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

