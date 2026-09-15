import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import Payment from '@/models/Payment';
import Product from '@/models/Product';
import Customer from '@/models/Customer';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth, getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { updateStock } from '@/lib/stock';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';
import { runWithOptionalMongoTransaction } from '@/lib/mongo-session';
import {
  calculateOnAccountRefundAmount,
  getOnAccountTotalForTransaction,
} from '@/lib/customer-credit';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const authUser = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    const body = await request.json();
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (!(await hasTenantPermission(authUser.role, tenantId, 'refunds.process'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
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

    const currentUser = await getCurrentUser(request);
    const { items, reason, notes } = body;

    // If no items specified, refund all items (full refund)
    const itemsToRefund = items || transaction.items.map((item: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      productId: item.product.toString(),
      quantity: item.quantity,
    }));

    // Validate items to refund
    const refundItems: { productId: string; quantity: number; price: number; subtotal: number }[] = [];
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

    // Mark original transaction as refunded if full refund
    const isFullRefund = refundItems.length === transaction.items.length &&
      refundItems.every((item: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const original = transaction.items.find((i: any) => i.product.toString() === item.productId); // eslint-disable-line @typescript-eslint/no-explicit-any
        return original && item.quantity === original.quantity;
      });

    let refundTransaction: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    let refundPayment: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
    let onAccountRefundAmount = 0;
    let accountBalanceBefore: number | undefined;
    let accountBalanceAfter: number | undefined;

    try {
      await runWithOptionalMongoTransaction(async (session) => {
        // Atomic claim: fails if a concurrent refund already changed this
        // transaction's status (double-submit / retry / two staff refunding at once).
        const claimed = await Transaction.findOneAndUpdate(
          { _id: id, tenantId, status: 'completed' },
          { $set: { status: isFullRefund ? 'refunded' : 'completed' } },
          session ? { session, new: true } : { new: true }
        );
        if (!claimed) {
          throw new Error('REFUND_CONFLICT');
        }

        const [createdRefund] = await Transaction.create(
          [{
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
          }],
          session ? { session } : {}
        );
        refundTransaction = createdRefund;

        // Restore stock for refunded items (only if product tracks inventory)
        for (const refundItem of refundItems) {
          const productQuery = Product.findOne({ _id: refundItem.productId, tenantId });
          const product = session ? await productQuery.session(session) : await productQuery;
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
              },
              session
            );
          }
        }

        // Create Payment refund record if original payment exists
        const originalPaymentQuery = Payment.findOne({
          tenantId,
          transactionId: transaction._id,
          status: 'completed',
        });
        const originalPayment = session ? await originalPaymentQuery.session(session) : await originalPaymentQuery;

        if (originalPayment) {
          const [createdPayment] = await Payment.create(
            [{
              tenantId,
              transactionId: refundTransaction._id,
              method: originalPayment.method,
              amount: refundAmount,
              status: 'refunded',
              details: originalPayment.details,
              processedBy: currentUser?.userId,
              processedAt: new Date(),
              refundedAt: new Date(),
              refundReason: body.reason || body.notes || 'Transaction refund',
            }],
            session ? { session } : {}
          );
          refundPayment = createdPayment;

          originalPayment.status = 'refunded';
          originalPayment.refundedAt = new Date();
          originalPayment.refundReason = body.reason || body.notes || 'Transaction refund';
          await originalPayment.save(session ? { session } : {});
        }

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
              const custQuery = Customer.findOne({ _id: transaction.customerId, tenantId }).select('accountBalance');
              const cust = session ? await custQuery.session(session) : await custQuery;
              if (cust) {
                accountBalanceBefore = cust.accountBalance ?? 0;
                accountBalanceAfter = Math.max(0, accountBalanceBefore - onAccountRefundAmount);
                await Customer.updateOne(
                  { _id: cust._id },
                  { $inc: { accountBalance: -onAccountRefundAmount } },
                  session ? { session } : {}
                );
                // Clamp negative balances from rounding edge cases
                if (accountBalanceAfter < 0.01) {
                  await Customer.updateOne(
                    { _id: cust._id },
                    { $set: { accountBalance: 0 } },
                    session ? { session } : {}
                  );
                  accountBalanceAfter = 0;
                }
              }
            }
          }
        }
      });
    } catch (txError: unknown) {
      if (txError instanceof Error && txError.message === 'REFUND_CONFLICT') {
        return NextResponse.json(
          { success: false, error: t('validation.transactionAlreadyRefunded', 'Transaction has already been refunded') },
          { status: 409 }
        );
      }
      throw txError;
    }

    if (isFullRefund) {
      transaction.status = 'refunded';
    }

    // Best-effort external side effects — kept outside the DB transaction
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

