import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth, getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { updateStock } from '@/lib/stock';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
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
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const rl = checkRateLimit(`transactions:refund:${tenantId}`, 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    const transaction = await prisma.transaction.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });
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
    const itemsToRefund: { productId: string; quantity: number }[] = items || transaction.items
      .filter((item) => item.productId)
      .map((item) => ({
        productId: item.productId as string,
        quantity: item.quantity,
      }));

    // Validate items to refund
    const refundItems: { productId: string; quantity: number; price: number; subtotal: number }[] = [];
    let refundAmount = 0;

    for (const refundItem of itemsToRefund) {
      const originalItem = transaction.items.find(
        (item) => item.productId === refundItem.productId
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
        price: Number(originalItem.price),
        subtotal: Number(originalItem.price) * refundItem.quantity,
      });

      refundAmount += Number(originalItem.price) * refundItem.quantity;
    }

    // Calculate proportional discount refund if applicable
    const discountAmount = transaction.discountAmount ? Number(transaction.discountAmount) : 0;
    const txSubtotal = Number(transaction.subtotal);
    if (discountAmount > 0 && txSubtotal > 0) {
      const discountRatio = refundAmount / txSubtotal;
      const refundDiscount = Math.round(discountAmount * discountRatio * 100) / 100;
      refundAmount = Math.round((refundAmount - refundDiscount) * 100) / 100;
    }

    // Mark original transaction as refunded if full refund
    const isFullRefund = refundItems.length === transaction.items.length &&
      refundItems.every((item) => {
        const original = transaction.items.find((i) => i.productId === item.productId);
        return original && item.quantity === original.quantity;
      });

    let refundTransaction: Awaited<ReturnType<typeof prisma.transaction.create>> | null = null;
    let refundPayment: Awaited<ReturnType<typeof prisma.payment.create>> | null = null;
    let onAccountRefundAmount = 0;
    let accountBalanceBefore: number | undefined;
    let accountBalanceAfter: number | undefined;

    try {
      await prisma.$transaction(async (tx) => {
        // Atomic claim: fails if a concurrent refund already changed this
        // transaction's status (double-submit / retry / two staff refunding at once).
        const claim = await tx.transaction.updateMany({
          where: { id, tenantId, status: 'completed' },
          data: { status: isFullRefund ? 'refunded' : 'completed' },
        });
        if (claim.count === 0) {
          throw new Error('REFUND_CONFLICT');
        }

        const refundReceiptNumber = `REF-${transaction.receiptNumber || transaction.id.slice(-8)}`;
        const createdRefund = await tx.transaction.create({
          data: {
            id: randomUUID(),
            tenantId,
            items: {
              create: refundItems.map((item) => ({
                id: randomUUID(),
                productId: item.productId,
                name: transaction.items.find((i) => i.productId === item.productId)?.name || '',
                price: item.price,
                quantity: item.quantity,
                subtotal: item.subtotal,
              })),
            },
            subtotal: refundAmount,
            total: refundAmount,
            paymentMethod: transaction.paymentMethod,
            status: 'refunded',
            receiptNumber: refundReceiptNumber,
            notes: notes || reason || 'Refund',
          },
          include: { items: true },
        });
        refundTransaction = createdRefund;

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
                transactionId: createdRefund.id,
                reason: reason || 'Transaction refund',
                notes: notes,
              }
            );
          }
        }

        // Create Payment refund record if original payment exists
        const originalPayment = await tx.payment.findFirst({
          where: { tenantId, transactionId: transaction.id, status: 'completed' },
        });

        if (originalPayment) {
          const createdPayment = await tx.payment.create({
            data: {
              id: randomUUID(),
              tenantId,
              transactionId: createdRefund.id,
              method: originalPayment.method,
              amount: refundAmount,
              status: 'refunded',
              detailsCardLast4: originalPayment.detailsCardLast4,
              detailsCardType: originalPayment.detailsCardType,
              detailsCardBrand: originalPayment.detailsCardBrand,
              detailsGatewayTxnId: originalPayment.detailsGatewayTxnId,
              detailsProvider: originalPayment.detailsProvider,
              detailsCashReceived: originalPayment.detailsCashReceived,
              detailsChange: originalPayment.detailsChange,
              detailsCheckNumber: originalPayment.detailsCheckNumber,
              detailsNotes: originalPayment.detailsNotes,
              processedById: currentUser?.userId,
              processedAt: new Date(),
              refundedAt: new Date(),
              refundReason: body.reason || body.notes || 'Transaction refund',
            },
          });
          refundPayment = createdPayment;

          await tx.payment.update({
            where: { id: originalPayment.id },
            data: {
              status: 'refunded',
              refundedAt: new Date(),
              refundReason: body.reason || body.notes || 'Transaction refund',
            },
          });
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
              const cust = await tx.customer.findFirst({
                where: { id: transaction.customerId, tenantId },
                select: { id: true, accountBalance: true },
              });
              if (cust) {
                accountBalanceBefore = Number(cust.accountBalance ?? 0);
                accountBalanceAfter = Math.max(0, accountBalanceBefore - onAccountRefundAmount);
                await tx.customer.update({
                  where: { id: cust.id },
                  data: { accountBalance: { decrement: onAccountRefundAmount } },
                });
                // Clamp negative balances from rounding edge cases
                if (accountBalanceAfter < 0.01) {
                  await tx.customer.update({
                    where: { id: cust.id },
                    data: { accountBalance: 0 },
                  });
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
      const integration = await prisma.tenantEcommerceIntegration.findFirst({
        where: { tenantId, provider: 'shopify', isActive: true },
      });
      if (integration?.shopDomain) {
        const { getShopifyAccessTokenForIntegration } = await import('@/lib/ecommerce/shopify-token');
        const { createShopifyRefund } = await import('@/lib/ecommerce/shopify-refund');
        // lib/ecommerce/shopify-token.ts is still typed against the Mongoose
        // ITenantEcommerceIntegration shape (out of this migration's scope);
        // adapt the Prisma row's shape at the call boundary until that lib
        // is ported.
        const accessToken = await getShopifyAccessTokenForIntegration(
          integration as unknown as Parameters<typeof getShopifyAccessTokenForIntegration>[0]
        );
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
        refundTransactionId: (refundTransaction as unknown as { id: string })?.id,
        refundAmount,
        onAccountRefundAmount,
        customerId: transaction.customerId ?? undefined,
        accountBalanceBefore,
        accountBalanceAfter,
        itemsRefunded: refundItems.length,
        isFullRefund,
        refundPaymentId: (refundPayment as unknown as { id: string } | null)?.id,
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
    const t = await getValidationTranslatorFromRequest(request);
    const message = error instanceof Error ? error.message : undefined;
    if (message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: t('validation.unauthorized', 'Unauthorized') },
        { status: 401 }
      );
    }
    if (message?.includes('Forbidden')) {
      return NextResponse.json(
        { success: false, error: t('validation.forbidden', message) },
        { status: 403 }
      );
    }
    logger.error('Refund error:', error);
    return NextResponse.json(
      { success: false, error: message || t('validation.refundFailed', 'Refund failed') },
      { status: 400 }
    );
  }
}
