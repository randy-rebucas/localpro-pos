import { NextRequest, NextResponse } from 'next/server';
import { planRefund, refundAmountFor, refundedPortion, REFUND_RECEIPT_PREFIX, RefundPlanError, type RefundErrorCode, type RefundPlan } from '@/lib/refund-plan';
import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import Payment from '@/models/Payment';
import Product from '@/models/Product';
import Customer from '@/models/Customer';
import ProductBundle from '@/models/ProductBundle';
import CashDrawerSession from '@/models/CashDrawerSession';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth, getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { updateStock, updateBundleStock, insertStockMovements, STOCK_SNAPSHOT_FIELDS, StockMovementInput, StockProductSnapshot } from '@/lib/stock';
import { SubscriptionService } from '@/lib/subscription';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
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
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const rl = checkRateLimit(`transactions:refund:${tenantId}`, 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
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

    // Works from what earlier refunds left, so a sale can be refunded in parts
    let plan: RefundPlan;
    try {
      plan = planRefund(transaction.items, items);
    } catch (planError: unknown) {
      if (!(planError instanceof RefundPlanError)) throw planError;
      const refundPlanErrors: Record<RefundErrorCode, string> = {
        invalid_quantity: t('validation.invalidRefundQuantity', 'Refund quantity must be a positive whole number'),
        item_not_found: t('validation.itemNotFoundInTransaction', 'Item {productId} not found in transaction').replace('{productId}', planError.productId ?? ''),
        exceeds_remaining: t('validation.cannotRefundMoreThanPurchased', 'Cannot refund more than purchased'),
        nothing_to_refund: t('validation.nothingToRefund', 'Nothing left to refund on this transaction'),
      };
      return NextResponse.json({ success: false, error: refundPlanErrors[planError.code] }, { status: 400 });
    }
    const refundItems = plan.allocations;
    const { isFullRefund } = plan;
    const refundAmount = refundAmountFor({
      linesValue: plan.subtotal,
      saleSubtotal: transaction.subtotal,
      saleTotal: transaction.total,
      alreadyRefunded: transaction.refundedAmount,
      isFullRefund,
    });

    // The refund's own share of each figure, so the sales journal can reverse it
    const portionOf = (saleAmount?: number) =>
      refundedPortion(saleAmount ?? 0, transaction.total, transaction.refundedAmount ?? 0, refundAmount);

    const refundCount = transaction.refundCount ?? 0;
    const baseRefundReceipt = `${REFUND_RECEIPT_PREFIX}${transaction.receiptNumber || transaction._id.toString().slice(-8)}`;
    const refundReceiptNumber = refundCount === 0 ? baseRefundReceipt : `${baseRefundReceipt}-${refundCount + 1}`;

    // Partial refunds made before per-line tracking left no record of what they
    // covered, so another refund here could pay the same items back twice.
    if (refundCount === 0 && await Transaction.exists({ tenantId, receiptNumber: baseRefundReceipt })) {
      return NextResponse.json(
        { success: false, error: t('validation.legacyPartialRefund', 'This sale has an earlier partial refund with no item record. Process any further refund manually.') },
        { status: 409 }
      );
    }

    // A tenant has one open drawer at a time, and cash comes out of it whoever
    // processes the refund. Payment.processedBy and the audit log record who did.
    const openDrawer = transaction.paymentMethod === 'cash'
      ? await CashDrawerSession.findOne({ tenantId, status: 'open' }).select('userId').lean()
      : null;

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
          // refundCount makes a concurrent partial refund lose this claim too, so
          // two requests can't both spend the same remaining quantity.
          { _id: id, tenantId, status: 'completed', refundCount: refundCount === 0 ? { $in: [0, null] } : refundCount },
          {
            $set: {
              status: isFullRefund ? 'refunded' : 'completed',
              ...Object.fromEntries(
                [...plan.refundedQuantities].map(([lineIndex, quantity]) => [`items.${lineIndex}.refundedQuantity`, quantity])
              ),
            },
            $inc: { refundCount: 1, refundedAmount: refundAmount },
          },
          session ? { session, new: true } : { new: true }
        );
        if (!claimed) {
          throw new Error('REFUND_CONFLICT');
        }

        const [createdRefund] = await Transaction.create(
          [{
            tenantId,
            userId: openDrawer?.userId ?? authUser.userId,
            items: refundItems.map((item) => ({
              product: item.productId,
              name: item.name,
              price: item.price,
              quantity: item.quantity,
              subtotal: item.subtotal,
            })),
            subtotal: plan.subtotal,
            discountCategory: transaction.discountCategory,
            discountAmount: portionOf(transaction.discountAmount),
            taxAmount: portionOf(transaction.taxAmount),
            taxExemptAmount: portionOf(transaction.taxExemptAmount),
            zeroRatedAmount: portionOf(transaction.zeroRatedAmount),
            total: refundAmount,
            paymentMethod: transaction.paymentMethod,
            status: 'refunded',
            receiptNumber: refundReceiptNumber,
            notes: notes || reason || 'Refund',
          }],
          session ? { session } : {}
        );
        refundTransaction = createdRefund;

        // Restore stock for refunded items (only if product tracks inventory).
        // One batched product read (reused as updateStock snapshots) and one
        // movement insert, instead of two reads + an insert per item.
        // A product on several lines is restored once, with the combined quantity.
        const stockReturns = new Map<string, number>();
        for (const item of refundItems) {
          if (item.productId) stockReturns.set(item.productId, (stockReturns.get(item.productId) ?? 0) + item.quantity);
        }
        const refundProductsQuery = Product.find({
          _id: { $in: [...stockReturns.keys()] },
          tenantId,
        })
          .select(STOCK_SNAPSHOT_FIELDS)
          .lean<Array<StockProductSnapshot & { _id: { toString(): string } }>>();
        if (session) refundProductsQuery.session(session);
        const refundProducts = new Map((await refundProductsQuery).map((p) => [p._id.toString(), p]));
        const refundMovements: StockMovementInput[] = [];
        for (const [productId, quantity] of stockReturns) {
          const product = refundProducts.get(productId);
          if (product && product.trackInventory !== false) {
            await updateStock(
              productId,
              tenantId,
              quantity, // Positive to restore
              'return',
              {
                transactionId: refundTransaction._id.toString(),
                reason: reason || 'Transaction refund',
                notes: notes,
                product,
                movements: refundMovements,
              },
              session
            );
          }
        }

        // Anything left is a bundle line, which returns its component products
        const bundleIds = [...stockReturns.keys()].filter((id) => !refundProducts.has(id));
        if (bundleIds.length > 0) {
          const bundlesQuery = ProductBundle.find({ _id: { $in: bundleIds }, tenantId })
            .select('name trackInventory items')
            .lean();
          if (session) bundlesQuery.session(session);
          for (const bundle of await bundlesQuery) {
            const bundleId = bundle._id.toString();
            await updateBundleStock(
              bundleId,
              tenantId,
              stockReturns.get(bundleId) ?? 0,
              'return',
              {
                transactionId: refundTransaction._id.toString(),
                reason: reason || 'Transaction refund',
                notes: notes,
                movements: refundMovements,
              },
              session,
              { bundle }
            );
          }
        }
        await insertStockMovements(refundMovements, session);

        // Create Payment refund record if original payment exists
        const originalPaymentQuery = Payment.findOne({
          tenantId,
          transactionId: transaction._id,
          status: { $in: ['completed', 'partially_refunded'] },
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

          // Only a refund that covers the whole payment marks it refunded
          const paymentRefundedTotal = Math.round(((originalPayment.refundedAmount ?? 0) + refundAmount) * 100) / 100;
          originalPayment.status = isFullRefund || paymentRefundedTotal >= originalPayment.amount
            ? 'refunded'
            : 'partially_refunded';
          originalPayment.refundedAmount = paymentRefundedTotal;
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
      const ids = [...new Set(refundItems.flatMap((x) => (x.productId ? [x.productId] : [])))];
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
          refundItems.flatMap((i) => (i.productId ? [{ productId: i.productId, quantity: i.quantity }] : [])),
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

