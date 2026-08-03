import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth, getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { updateStock } from '@/lib/stock';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';
import { runInTransaction, type PrismaTx } from '@/lib/db-transaction';
import {
  calculateOnAccountRefundAmount,
  getOnAccountTotalForTransaction,
} from '@/lib/customer-credit';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
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

    const transaction = await prisma.transaction.findFirst({ where: { id, tenantId }, include: { items: true } });
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
    const itemsToRefund = items || transaction.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));

    // Validate items to refund
    const refundItems: Array<{ productId: string; quantity: number; price: number; subtotal: number; name: string }> = [];
    let refundAmount = 0;

    for (const refundItem of itemsToRefund) {
      const originalItem = transaction.items.find((item) => item.productId === refundItem.productId);

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

      const price = Number(originalItem.price);
      refundItems.push({
        productId: refundItem.productId,
        quantity: refundItem.quantity,
        price,
        subtotal: price * refundItem.quantity,
        name: originalItem.name,
      });

      refundAmount += price * refundItem.quantity;
    }

    // Calculate proportional discount refund if applicable
    const originalDiscountAmount = transaction.discountAmount ? Number(transaction.discountAmount) : 0;
    const originalSubtotal = Number(transaction.subtotal);
    if (originalDiscountAmount > 0 && originalSubtotal > 0) {
      const discountRatio = refundAmount / originalSubtotal;
      const refundDiscount = Math.round(originalDiscountAmount * discountRatio * 100) / 100;
      refundAmount = Math.round((refundAmount - refundDiscount) * 100) / 100;
    }

    const isFullRefund = refundItems.length === transaction.items.length &&
      refundItems.every((item) => {
        const original = transaction.items.find((i) => i.productId === item.productId);
        return original && item.quantity === original.quantity;
      });

    let refundPayment: { id: string } | null = null;
    let paymentRefundWarning: string | undefined;
    let onAccountRefundAmount = 0;
    let accountBalanceBefore: number | undefined;
    let accountBalanceAfter: number | undefined;

    const { refundTransaction } = await runInTransaction(async (tx: PrismaTx) => {
      // Create refund transaction
      const refundTx = await tx.transaction.create({
        data: {
          tenantId,
          subtotal: refundAmount,
          total: refundAmount,
          paymentMethod: transaction.paymentMethod,
          status: 'refunded',
          receiptNumber: `REF-${transaction.receiptNumber || transaction.id.slice(-8)}`,
          notes: notes || reason || 'Refund',
          items: {
            create: refundItems.map((item) => ({
              productId: item.productId,
              name: item.name,
              price: item.price,
              quantity: item.quantity,
              subtotal: item.subtotal,
            })),
          },
        },
        include: { items: true },
      });

      // Restore stock for refunded items (only if product tracks inventory)
      for (const refundItem of refundItems) {
        const product = await tx.product.findFirst({ where: { id: refundItem.productId, tenantId } });
        if (product && product.trackInventory !== false) {
          await updateStock(
            refundItem.productId,
            tenantId,
            refundItem.quantity, // Positive to restore
            'return',
            {
              transactionId: refundTx.id,
              reason: reason || 'Transaction refund',
              notes: notes,
            },
            tx
          );
        }
      }

      // Mark original transaction as refunded if full refund
      if (isFullRefund) {
        await tx.transaction.update({ where: { id: transaction.id }, data: { status: 'refunded' } });
      }

      // Create Payment refund record if original payment exists
      try {
        const originalPayment = await tx.payment.findFirst({
          where: { tenantId, transactionId: transaction.id, status: 'completed' },
        });

        if (originalPayment) {
          const user = await getCurrentUser(request);
          const created = await tx.payment.create({
            data: {
              tenantId,
              transactionId: refundTx.id,
              method: originalPayment.method,
              amount: refundAmount,
              status: 'refunded',
              details: originalPayment.details as Prisma.InputJsonValue | undefined,
              processedBy: user?.userId,
              processedAt: new Date(),
              refundedAt: new Date(),
              refundReason: body.reason || body.notes || 'Transaction refund',
            },
          });
          refundPayment = { id: created.id };

          // Mark original payment as refunded
          await tx.payment.update({
            where: { id: originalPayment.id },
            data: {
              status: 'refunded',
              refundedAt: new Date(),
              refundReason: body.reason || body.notes || 'Transaction refund',
            },
          });
        }
      } catch (paymentError) {
        logger.error('Failed to create payment refund record:', paymentError);
        paymentRefundWarning = 'Refund recorded but payment record could not be updated. Please update the payment manually.';
      }

      if (transaction.customerId && refundAmount > 0) {
        const onAccountTotal = await getOnAccountTotalForTransaction(
          tenantId,
          transaction.id,
          Number(transaction.total),
          transaction.paymentMethod
        );

        if (onAccountTotal > 0) {
          onAccountRefundAmount = calculateOnAccountRefundAmount(
            refundAmount,
            Number(transaction.total),
            onAccountTotal
          );

          if (onAccountRefundAmount > 0) {
            const cust = await tx.customer.findFirst({ where: { id: transaction.customerId, tenantId }, select: { id: true, accountBalance: true } });
            if (cust) {
              accountBalanceBefore = Number(cust.accountBalance ?? 0);
              accountBalanceAfter = Math.max(0, accountBalanceBefore - onAccountRefundAmount);
              if (accountBalanceAfter < 0.01) {
                await tx.customer.update({ where: { id: cust.id }, data: { accountBalance: 0 } });
                accountBalanceAfter = 0;
              } else {
                await tx.customer.update({ where: { id: cust.id }, data: { accountBalance: { decrement: onAccountRefundAmount } } });
              }
            }
          }
        }
      }

      return { refundTransaction: refundTx };
    });

    {
      const ids = refundItems.map((x) => x.productId);
      const { pushChannelInventoryForProducts } = await import('@/lib/ecommerce/inventory-push');
      void pushChannelInventoryForProducts(tenantId, ids, {
        stockReason: reason || 'Transaction refund',
      });
    }

    // If this was a Shopify-imported order, mirror the refund on Shopify
    if (transaction.salesChannel === 'shopify' && transaction.externalOrderId) {
      const integration = await prisma.tenantEcommerceIntegration.findFirst({
        where: { tenantId, provider: 'shopify', isActive: true },
      });
      if (integration?.shopDomain) {
        const { getShopifyAccessTokenForIntegration } = await import('@/lib/ecommerce/shopify-token');
        const { createShopifyRefund } = await import('@/lib/ecommerce/shopify-refund');
        const accessToken = await getShopifyAccessTokenForIntegration({
          _id: integration.id,
          shopDomain: integration.shopDomain,
          credentialsEncrypted: integration.credentialsEncrypted,
        });
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
        refundTransactionId: refundTransaction.id,
        refundAmount,
        onAccountRefundAmount,
        customerId: transaction.customerId ?? undefined,
        accountBalanceBefore,
        accountBalanceAfter,
        itemsRefunded: refundItems.length,
        isFullRefund,
        refundPaymentId: refundPayment ? (refundPayment as { id: string }).id : undefined,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        refundTransaction: { _id: refundTransaction.id, ...refundTransaction },
        originalTransaction: { _id: transaction.id, ...transaction },
        refundAmount,
        isFullRefund,
        refundPayment: refundPayment ? { _id: (refundPayment as { id: string }).id } : null,
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
