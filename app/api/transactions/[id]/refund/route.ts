import { NextRequest, NextResponse } from 'next/server';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth, getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { updateStock, insertStockMovements, STOCK_SNAPSHOT_FIELDS, StockMovementInput, StockProductSnapshot } from '@/lib/stock';
import { getRepos, runInTransaction, type Payment, type Transaction } from '@/lib/db';
import { SubscriptionService } from '@/lib/subscription';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import {
  calculateOnAccountRefundAmount,
  getOnAccountTotalForTransaction,
} from '@/lib/customer-credit';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const repos = getRepos();
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

    const transaction = await repos.transactions.findById(tenantId, id);
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
    const itemsToRefund = items || transaction.items.map((item) => ({
      productId: item.product!.toString(),
      quantity: item.quantity,
    }));

    // Validate items to refund
    const refundItems: { productId: string; quantity: number; price: number; subtotal: number }[] = [];
    let refundAmount = 0;

    for (const refundItem of itemsToRefund) {
      const originalItem = transaction.items.find((item) => item.product!.toString() === refundItem.productId);

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
      refundItems.every((item) => {
        const original = transaction.items.find((i) => i.product!.toString() === item.productId);
        return original && item.quantity === original.quantity;
      });

    let refundTransaction!: Transaction;
    let refundPayment = null as Payment | null;
    let onAccountRefundAmount = 0;
    let accountBalanceBefore: number | undefined;
    let accountBalanceAfter: number | undefined;

    try {
      await runInTransaction(async (tx) => {
        // Atomic claim: fails if a concurrent refund already changed this
        // transaction's status (double-submit / retry / two staff refunding at once).
        const claimed = await repos.transactions.claimStatus(tenantId, id, 'completed', isFullRefund ? 'refunded' : 'completed', { tx });
        if (!claimed) {
          throw new Error('REFUND_CONFLICT');
        }

        refundTransaction = await repos.transactions.create(
          tenantId,
          {
            items: refundItems.map((item) => ({
              product: item.productId,
              name: transaction.items.find((i) => i.product!.toString() === item.productId)?.name || '',
              price: item.price,
              quantity: item.quantity,
              subtotal: item.subtotal,
            })),
            subtotal: refundAmount,
            total: refundAmount,
            paymentMethod: transaction.paymentMethod,
            status: 'refunded',
            receiptNumber: `REF-${transaction.receiptNumber || transaction._id.slice(-8)}`,
            notes: notes || reason || 'Refund',
          },
          { tx }
        );

        // Restore stock for refunded items (only if product tracks inventory).
        // One batched product read (reused as updateStock snapshots) and one
        // movement insert, instead of two reads + an insert per item.
        const refundProducts = new Map<string, StockProductSnapshot>(
          (
            await repos.products.list(
              tenantId,
              { ids: refundItems.map((i) => i.productId) },
              { select: STOCK_SNAPSHOT_FIELDS, tx }
            )
          ).map((p) => [p._id, p])
        );
        const refundMovements: StockMovementInput[] = [];
        for (const refundItem of refundItems) {
          const product = refundProducts.get(String(refundItem.productId));
          if (product && product.trackInventory !== false) {
            await updateStock(
              refundItem.productId,
              tenantId,
              refundItem.quantity, // Positive to restore
              'return',
              {
                transactionId: refundTransaction._id,
                reason: reason || 'Transaction refund',
                notes: notes,
                product,
                movements: refundMovements,
              },
              tx
            );
          }
        }
        await insertStockMovements(refundMovements, tx);

        // Create Payment refund record if original payment exists
        const originalPayment = await repos.payments.findOne(
          tenantId,
          { transactionId: transaction._id, status: 'completed' },
          { tx }
        );

        if (originalPayment) {
          const refundReason = body.reason || body.notes || 'Transaction refund';
          refundPayment = await repos.payments.create(
            tenantId,
            {
              transactionId: refundTransaction._id,
              method: originalPayment.method,
              amount: refundAmount,
              status: 'refunded',
              details: originalPayment.details,
              processedBy: currentUser?.userId,
              processedAt: new Date(),
              refundedAt: new Date(),
              refundReason,
            },
            { tx }
          );

          await repos.payments.markRefunded(tenantId, originalPayment._id, { at: new Date(), reason: refundReason }, { tx });
        }

        if (transaction.customerId && refundAmount > 0) {
          // Reads outside the transaction on purpose: the original payment was
          // just marked refunded, and this total counts completed payments
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
              const cust = await repos.customers.findById(tenantId, transaction.customerId, { select: 'accountBalance', tx });
              if (cust) {
                accountBalanceBefore = cust.accountBalance ?? 0;
                accountBalanceAfter = Math.max(0, accountBalanceBefore - onAccountRefundAmount);
                await repos.customers.adjustAccountBalance(tenantId, cust._id, -onAccountRefundAmount, { tx });
                // Clamp negative balances from rounding edge cases
                if (accountBalanceAfter < 0.01) {
                  await repos.customers.setBalances(tenantId, cust._id, { accountBalance: 0 }, { tx });
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
      const integration = await repos.ecommerceIntegrations.findActive(tenantId, 'shopify');
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

    // Refunds are Transaction documents and count toward the monthly limit, as before
    await SubscriptionService.trackTransactionCreated(String(tenantId));

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.TRANSACTION_REFUND,
      entityType: 'transaction',
      entityId: id,
      changes: {
        refundTransactionId: refundTransaction._id,
        refundAmount,
        onAccountRefundAmount,
        customerId: transaction.customerId,
        accountBalanceBefore,
        accountBalanceAfter,
        itemsRefunded: refundItems.length,
        isFullRefund,
        refundPaymentId: refundPayment?._id,
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

