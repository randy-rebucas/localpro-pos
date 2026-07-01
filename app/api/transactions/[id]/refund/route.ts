import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import Payment from '@/models/Payment';
import Product from '@/models/Product';
import Customer from '@/models/Customer';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireRole, getCurrentUser } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { updateStock } from '@/lib/stock';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';
import {
  calculateOnAccountRefundAmount,
  getOnAccountTotalForTransaction,
} from '@/lib/customer-credit';

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
    const itemsToRefund = items || transaction.items.map((item: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      productId: item.product.toString(),
      quantity: item.quantity,
    }));

    // Validate items to refund
    const refundItems = [];
    let refundAmount = 0;

    for (const refundItem of itemsToRefund) {
      const originalItem = transaction.items.find(
        (item: any) => item.product.toString() === refundItem.productId // eslint-disable-line @typescript-eslint/no-explicit-any
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
    if (transaction.discountAmount && transaction.discountAmount > 0 && transaction.subtotal > 0) {
      const discountRatio = refundAmount / transaction.subtotal;
      const refundDiscount = Math.round(transaction.discountAmount * discountRatio * 100) / 100;
      refundAmount = Math.round((refundAmount - refundDiscount) * 100) / 100;
    }

    // Create refund transaction
    const refundTransaction = await Transaction.create({
      tenantId,
      items: refundItems.map((item: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        product: item.productId,
        name: transaction.items.find((i: any) => i.product.toString() === item.productId)?.name || '', // eslint-disable-line @typescript-eslint/no-explicit-any
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

    {
      const ids = refundItems.map((x) => x.productId);
      const { pushChannelInventoryForProducts } = await import('@/lib/ecommerce/inventory-push');
      void pushChannelInventoryForProducts(tenantId, ids, {
        stockReason: reason || 'Transaction refund',
      });
    }

    // If this was a Shopify-imported order, mirror the refund on Shopify
    if (transaction.salesChannel === 'shopify' && transaction.externalOrderId) {
      const integration = await (await import('@/models/TenantEcommerceIntegration')).default.findOne({
        tenantId,
        provider: 'shopify',
        isActive: true,
      }).lean();
      if (integration?.shopDomain) {
        const { getShopifyAccessTokenForIntegration } = await import('@/lib/ecommerce/shopify-token');
        const { createShopifyRefund } = await import('@/lib/ecommerce/shopify-refund');
        const accessToken = await getShopifyAccessTokenForIntegration(integration);
        void createShopifyRefund(
          integration.shopDomain,
          accessToken,
          tenantId,
          transaction.externalOrderId,
          refundItems.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          refundAmount
        );
      }
    }

    // Mark original transaction as refunded if full refund
    const isFullRefund = refundItems.length === transaction.items.length &&
      refundItems.every((item: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const original = transaction.items.find((i: any) => i.product.toString() === item.productId); // eslint-disable-line @typescript-eslint/no-explicit-any
        return original && item.quantity === original.quantity;
      });

    if (isFullRefund) {
      transaction.status = 'refunded';
      await transaction.save();
    }

    // Create Payment refund record if original payment exists
    let refundPayment = null;
    let paymentRefundWarning: string | undefined;
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
      logger.error('Failed to create payment refund record:', paymentError);
      paymentRefundWarning = 'Refund recorded but payment record could not be updated. Please update the payment manually.';
    }

    let onAccountRefundAmount = 0;
    let accountBalanceBefore: number | undefined;
    let accountBalanceAfter: number | undefined;

    if (transaction.customerId && refundAmount > 0) {
      const onAccountTotal = await getOnAccountTotalForTransaction(
        tenantId,
        transaction._id,
        transaction.total,
        transaction.paymentMethod
      );

      if (onAccountTotal > 0) {
        onAccountRefundAmount = calculateOnAccountRefundAmount(
          refundAmount,
          transaction.total,
          onAccountTotal
        );

        if (onAccountRefundAmount > 0) {
          const cust = await Customer.findOne({ _id: transaction.customerId, tenantId }).select('accountBalance');
          if (cust) {
            accountBalanceBefore = cust.accountBalance ?? 0;
            accountBalanceAfter = Math.max(0, accountBalanceBefore - onAccountRefundAmount);
            await Customer.updateOne(
              { _id: cust._id },
              { $inc: { accountBalance: -onAccountRefundAmount } }
            );
            // Clamp negative balances from rounding edge cases
            if (accountBalanceAfter < 0.01) {
              await Customer.updateOne({ _id: cust._id }, { $set: { accountBalance: 0 } });
              accountBalanceAfter = 0;
            }
          }
        }
      }
    }

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.TRANSACTION_REFUND,
      entityType: 'transaction',
      entityId: id,
      changes: {
        refundTransactionId: refundTransaction._id.toString(),
        refundAmount,
        onAccountRefundAmount,
        customerId: transaction.customerId?.toString(),
        accountBalanceBefore,
        accountBalanceAfter,
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
      ...(paymentRefundWarning ? { warning: paymentRefundWarning } : {}),
    }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Refund failed';
    if (message === 'Unauthorized' || message.includes('Forbidden')) {
      return NextResponse.json(
        { success: false, error: message },
        { status: message === 'Unauthorized' ? 401 : 403 }
      );
    }
    logger.error('Refund error:', error);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

