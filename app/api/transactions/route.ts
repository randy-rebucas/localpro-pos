import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma, { dbTransaction } from '@/lib/db';
import type { Prisma, PaymentMethodType, PaymentMethodSimple, PaymentStatus, DiscountCategory, OrderType } from '@prisma/client';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { validateAndSanitize, validateTransaction } from '@/lib/validation';
import { generateReceiptNumber, isDuplicateReceiptNumberError } from '@/lib/receipt';
import { updateStock, updateBundleStock, getProductStock } from '@/lib/stock';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { getTenantSettingsById } from '@/lib/tenant';
import { checkSubscriptionLimit, SubscriptionService, checkFeatureAccess } from '@/lib/subscription';
import { logger } from '@/lib/logger';
import { calculateTax } from '@/lib/tax-calculation';
import { checkRateLimit } from '@/lib/rate-limit';
import { wouldExceedCreditLimit } from '@/lib/customer-credit';
import { postTransactionToLedger } from '@/lib/accounting/auto-post';

// Postgres ids here are still Mongo-ObjectId-hex-shaped during the migration
// (see prisma/schema.prisma header comment) — keep the same 24-hex-char shape
// check the old Mongoose code used instead of mongoose.Types.ObjectId.isValid.
const OBJECT_ID_RE = /^[a-f\d]{24}$/i;
function isValidObjectId(v: unknown): v is string {
  return typeof v === 'string' && OBJECT_ID_RE.test(v);
}

interface VariationInput {
  size?: string;
  color?: string;
  type?: string;
}

interface TransactionItemInput {
  productId?: string;
  quantity: number;
  variation?: VariationInput;
  bundleId?: string;
}

interface PaymentInput {
  method: 'cash' | 'card' | 'digital' | 'check' | 'other' | 'on_account';
  amount: number;
  cashReceived?: number;
  change?: number;
  provider?: string;
  transactionId?: string;
  cardLast4?: string;
  cardType?: string;
  cardBrand?: string;
  checkNumber?: string;
  /** Split-check guest reference or notes */
  notes?: string;
}

interface TransactionInput {
  items: TransactionItemInput[];
  paymentMethod: string;
  cashReceived?: number;
  notes?: string;
  discountCode?: string;
  branchId?: string;
  payments?: PaymentInput[];
  scPwdName?: string;
  scPwdId?: string;
  deviceId?: string;
}

/** Persisted Payment.method — maps POS transaction methods to Payment enum. */
function toPaymentRecordMethod(m: string): PaymentMethodSimple {
  if (m === 'on_account') return 'on_account';
  if (m === 'cash') return 'cash';
  if (m === 'card') return 'card';
  if (m === 'check') return 'check';
  if (['digital', 'tap_to_pay', 'wallet', 'qr_code', 'bnpl'].includes(m)) return 'digital';
  return 'other';
}

const TRANSACTION_PAYMENT_METHODS = new Set([
  'cash', 'card', 'digital', 'tap_to_pay', 'wallet', 'qr_code', 'bnpl', 'on_account',
]);

function normalizeTransactionPaymentMethod(m: string): PaymentMethodType {
  if (TRANSACTION_PAYMENT_METHODS.has(m)) return m as PaymentMethodType;
  if (m === 'check' || m === 'other') return 'digital';
  throw new Error(`Invalid payment method: ${m}`);
}

function getTransactionErrorStatus(error: unknown): number {
  if (error && typeof error === 'object') {
    const err = error as { name?: string; code?: string | number; message?: string };
    if (err.name === 'ValidationError' || err.name === 'CastError') return 400;
    if (err.code === 11000 || err.code === 'P2002') return 400;
  }
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  const businessPatterns = [
    'insufficient stock',
    'invalid',
    'not found',
    'not enabled',
    'limit',
    'required',
    'unauthorized',
    'forbidden',
    'validation failed',
    'duplicate',
    'already exists',
    'credit limit',
  ];
  if (businessPatterns.some((p) => message.includes(p))) return 400;
  return 500;
}

class IdempotentReplayError extends Error {
  idempotencyKey: string;
  constructor(idempotencyKey: string) {
    super('Duplicate idempotency key');
    this.name = 'IdempotentReplayError';
    this.idempotencyKey = idempotencyKey;
  }
}

interface TransactionItemRecord {
  productId?: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
  bundleId?: string;
  categoryId?: string;
  taxExempt?: boolean;
  zeroRated?: boolean;
  modifiers?: Array<{ name: string; chosenOption: string; price: number }>;
}

export async function GET(request: NextRequest) {
  try {
    // Require authentication — financial data must not be public
    let tenantId: string;
    let role: string;
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
      role = tenantAccess.user.role;
    } catch (authError: unknown) {
      const t = await getValidationTranslatorFromRequest(request);
      const msg = authError instanceof Error ? authError.message : '';
      return NextResponse.json(
        { success: false, error: msg.includes('Forbidden') ? t('validation.forbidden', 'Forbidden') : t('validation.unauthorized', 'Unauthorized') },
        { status: msg.includes('Forbidden') ? 403 : 401 }
      );
    }

    const t = await getValidationTranslatorFromRequest(request);
    if (!(await hasTenantPermission(role, tenantId, 'transactions.view'))) {
      return NextResponse.json(
        { success: false, error: t('validation.forbidden', 'Forbidden') },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const rawLimit = parseInt(searchParams.get('limit') || '50');
    const limit = Math.min(Math.max(1, rawLimit), 200); // cap at 200
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const skip = (page - 1) * limit;
    const customerIdFilter = searchParams.get('customerId');

    const txQuery: Prisma.TransactionWhereInput = { tenantId, isActive: { not: false } };
    if (customerIdFilter) {
      txQuery.customerId = customerIdFilter;
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where: txQuery,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
        include: {
          items: { include: { product: { select: { name: true } } } },
          customer: { select: { firstName: true, lastName: true } },
          user: { select: { name: true, email: true } },
        },
      }),
      prisma.transaction.count({ where: txQuery }),
    ]);

    return NextResponse.json({
      success: true,
      data: transactions || [],
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Validate tenant access for authenticated requests
    let tenantId: string;
    let user: { userId: string; tenantId: string; email: string; role: string };
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
      user = tenantAccess.user;
    } catch (authError: unknown) {
      const authMessage = authError instanceof Error ? authError.message : '';
      if (authMessage.includes('Unauthorized') || authMessage.includes('Forbidden')) {
        return NextResponse.json(
          { success: false, error: authMessage },
          { status: authMessage.includes('Unauthorized') ? 401 : 403 }
        );
      }
      throw authError;
    }

    const t = await getValidationTranslatorFromRequest(request);
    const rl = checkRateLimit(`transactions:${user.userId}`, 120, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    const body = await request.json();
    const { data, errors } = validateAndSanitize(body, validateTransaction, t);

    if (errors.length > 0) {
      return NextResponse.json(
        { success: false, errors },
        { status: 400 }
      );
    }

    const { items, paymentMethod, cashReceived, notes, discountCode, branchId, payments, scPwdName, scPwdId, deviceId } = data as unknown as TransactionInput;
    const customerId = body.customerId as string | undefined;
    if (customerId && !isValidObjectId(customerId)) {
      return NextResponse.json({ success: false, error: t('validation.invalidCustomerId', 'Invalid customer ID') }, { status: 400 });
    }
    const loyaltyPointsToRedeem = typeof body.loyaltyPointsToRedeem === 'number' ? Math.floor(body.loyaltyPointsToRedeem) : 0;

    // Dedupe a client retry/double-submit of the same checkout (dropped
    // response, double-tap "Pay") — without this, a repeat POST would fully
    // re-run the sale: double stock deduction, double charge, double loyalty
    // points. Mirrors the same pattern used by transactions/manual.
    const idempotencyKey = typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
      ? body.idempotencyKey.trim()
      : undefined;
    if (idempotencyKey) {
      const existing = await prisma.transaction.findFirst({ where: { tenantId, idempotencyKey } });
      if (existing) {
        return NextResponse.json({ success: true, data: existing }, { status: 200 });
      }
    }

    // Restaurant & split-billing fields
    const rawOrderType = typeof body.orderType === 'string' ? body.orderType : undefined;
    const orderType =
      rawOrderType && ['dine-in', 'takeout', 'delivery'].includes(rawOrderType)
        ? (rawOrderType as OrderType)
        : undefined;
    const tableNumber = typeof body.tableNumber === 'string' ? body.tableNumber : undefined;
    const tableId = typeof body.tableId === 'string' ? body.tableId : undefined;
    const splitCount = typeof body.splitCount === 'number' ? body.splitCount : undefined;
    const splitPayments = Array.isArray(body.splitPayments) ? body.splitPayments : undefined;
    const tipAmount = typeof body.tipAmount === 'number' && body.tipAmount > 0 ? body.tipAmount : undefined;

    // Check subscription transaction limits
    const currentTransactionCount = await prisma.transaction.count({
      where: {
        tenantId,
        createdAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          lt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
        },
      },
    });
    try {
      await checkSubscriptionLimit(tenantId.toString(), 'maxTransactions', currentTransactionCount);
    } catch (limitError: unknown) {
      return NextResponse.json(
        { success: false, error: (limitError as Error).message },
        { status: 403 }
      );
    }

    // ─── Loyalty: pre-validate customer and redemption ───
    let loyaltyEnabled = false;
    let loyaltyConfig: { pointsPerPeso: number; pesoPerPoint: number; minRedemption: number; isEnabled: boolean } | null = null;
    let loyaltyCustomer: { id: string; loyaltyPointsBalance: Prisma.Decimal | number | null } | null = null;
    let loyaltyDiscountAmount = 0;

    try {
      await checkFeatureAccess(tenantId.toString(), 'enableLoyaltyProgram');
      loyaltyEnabled = true;
    } catch {
      // Feature not available for this plan — loyalty is silently skipped
    }

    if (loyaltyEnabled && customerId) {
      const foundConfig = await prisma.loyaltyConfig.findUnique({ where: { tenantId } });
      loyaltyConfig = foundConfig
        ? {
            pointsPerPeso: Number(foundConfig.pointsPerPeso),
            pesoPerPoint: Number(foundConfig.pesoPerPoint),
            minRedemption: foundConfig.minRedemption,
            isEnabled: foundConfig.isEnabled,
          }
        : { pointsPerPeso: 1, pesoPerPoint: 0.10, minRedemption: 100, isEnabled: true };

      if (!loyaltyConfig.isEnabled) {
        loyaltyEnabled = false;
      }

      if (loyaltyEnabled) {
        const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId } });
        if (!customer) {
          return NextResponse.json({ success: false, error: t('validation.customerNotFound', 'Customer not found') }, { status: 404 });
        }
        loyaltyCustomer = customer;

        if (loyaltyPointsToRedeem > 0) {
          const balance = Number(customer.loyaltyPointsBalance ?? 0);
          if (loyaltyPointsToRedeem < loyaltyConfig.minRedemption) {
            return NextResponse.json(
              {
                success: false,
                error: t('validation.minimumPointsRequired', 'Minimum {min} points required for redemption')
                  .replace('{min}', loyaltyConfig.minRedemption.toString()),
              },
              { status: 400 }
            );
          }
          if (loyaltyPointsToRedeem > balance) {
            return NextResponse.json(
              {
                success: false,
                error: t('validation.insufficientLoyaltyPoints', 'Insufficient loyalty points. Balance: {balance}')
                  .replace('{balance}', balance.toString()),
              },
              { status: 400 }
            );
          }
          loyaltyDiscountAmount = loyaltyPointsToRedeem * loyaltyConfig.pesoPerPoint;
        }
      }
    }

    // Get tenant settings to check feature flags
    const tenantSettings = await getTenantSettingsById(tenantId);

    const usesOnAccount =
      paymentMethod === 'on_account' ||
      (Array.isArray(payments) && payments.some((p: PaymentInput) => p.method === 'on_account')) ||
      (Array.isArray(splitPayments) && splitPayments.some((p: { method?: string }) => p.method === 'on_account'));

    if (usesOnAccount) {
      if (tenantSettings?.enableOnAccountSales !== true) {
        return NextResponse.json(
          { success: false, error: t('validation.onAccountNotEnabled', 'On-account sales are not enabled for this store') },
          { status: 403 }
        );
      }
      if (!customerId || !String(customerId).trim()) {
        return NextResponse.json(
          { success: false, error: t('validation.customerRequiredOnAccount', 'Customer is required for on-account payment') },
          { status: 400 }
        );
      }
    }

    // Support for multiple payment methods (split payments)
    // Prefer `payments`; map restaurant `splitPayments` from body when present.
    const paymentsFromSplit: PaymentInput[] | undefined =
      Array.isArray(splitPayments) && splitPayments.length > 0
        ? splitPayments.map((sp: { method: string; amount: number; reference?: string }) => ({
            method: sp.method as PaymentInput['method'],
            amount: sp.amount,
            notes: sp.reference,
          }))
        : undefined;
    const effectivePayments: PaymentInput[] | undefined =
      Array.isArray(payments) && payments.length > 0 ? payments : paymentsFromSplit;
    const isMultiplePayments = Array.isArray(effectivePayments) && effectivePayments.length > 0;
    let finalPaymentMethod = paymentMethod;
    let finalCashReceived = cashReceived;
    let finalChange = 0;

    // Check if discounts are enabled (SC/PWD are legal requirements — always allowed)
    const legalDiscountCodes = ['SC20', 'PWD20'];
    const isLegalDiscount = discountCode && legalDiscountCodes.includes(
      typeof discountCode === 'string' ? discountCode.toUpperCase() : ''
    );
    if (discountCode && !isLegalDiscount && tenantSettings && tenantSettings.enableDiscounts === false) {
      return NextResponse.json(
        { success: false, error: t('validation.discountsNotEnabled', 'Discounts are not enabled for this tenant') },
        { status: 400 }
      );
    }

    // Validate and process items
    const transactionItems: TransactionItemRecord[] = [];
    let subtotal = 0;

    // Batch-load all products and bundles upfront to avoid N+1 queries
    const productIds = items.filter(i => i.productId && !i.bundleId).map(i => i.productId as string);
    const bundleIds = items.filter(i => i.bundleId).map(i => i.bundleId as string);

    const [productsArray, bundlesArray] = await Promise.all([
      productIds.length > 0
        ? prisma.product.findMany({ where: { id: { in: productIds }, tenantId } })
        : Promise.resolve([]),
      bundleIds.length > 0
        ? prisma.productBundle.findMany({ where: { id: { in: bundleIds }, tenantId, isActive: true }, include: { items: true } })
        : Promise.resolve([]),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productMap = new Map<string, any>(productsArray.map(p => [p.id, p]));
    const bundleMap = new Map(bundlesArray.map(b => [b.id, b]));

    // Also batch-load all products referenced by bundles
    const bundleProductIds = bundlesArray.flatMap(b => b.items.map((bi) => bi.productId));
    if (bundleProductIds.length > 0) {
      const bundleProducts = await prisma.product.findMany({ where: { id: { in: bundleProductIds }, tenantId } });
      for (const bp of bundleProducts) {
        if (!productMap.has(bp.id)) {
          productMap.set(bp.id, bp);
        }
      }
    }

    for (const item of items) {
      const { productId, quantity, variation, bundleId } = item;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itemModifiers = Array.isArray((item as any).modifiers) ? (item as any).modifiers : undefined;

      // Handle bundles
      if (bundleId) {
        const bundle = bundleMap.get(bundleId);
        if (!bundle) {
          return NextResponse.json({ success: false, error: t('validation.bundleNotFound', 'Bundle {bundleId} not found').replace('{bundleId}', bundleId) }, { status: 404 });
        }

        // Check stock for all bundle items - but respect allowOutOfStockSales and trackInventory
        for (const bundleItem of bundle.items) {
          const bundleProduct = productMap.get(bundleItem.productId);
          if (!bundleProduct) {
            continue; // Skip if product not found (shouldn't happen, but safety check)
          }

          const trackInventory = bundleProduct.trackInventory !== false; // Default to true if not set
          const allowOutOfStockSales = bundleProduct.allowOutOfStockSales === true;

          if (trackInventory && !allowOutOfStockSales) {
            const availableStock = await getProductStock(
              bundleItem.productId,
              tenantId,
              {
                branchId: typeof branchId === 'string' ? branchId : undefined,
                variation: {
                  size: bundleItem.variationSize ?? undefined,
                  color: bundleItem.variationColor ?? undefined,
                  type: bundleItem.variationType ?? undefined,
                },
              }
            );

            const requiredStock = bundleItem.quantity * quantity;
            if (availableStock < requiredStock) {
              const errorMsg = t('validation.insufficientStockBundle', 'Insufficient stock for bundle item {productName}. Available: {available}, Required: {required}')
                    .replace('{productName}', bundleItem.productName)
                    .replace('{available}', availableStock.toString())
                    .replace('{required}', requiredStock.toString());
              return NextResponse.json(
                {
                  success: false,
                  error: errorMsg,
                },
                { status: 400 }
              );
            }
          }
        }

        const bundlePrice = Number(bundle.price);
        const itemSubtotal = bundlePrice * quantity;
        subtotal += itemSubtotal;

        transactionItems.push({
          bundleId: bundle.id,
          name: bundle.name,
          price: bundlePrice,
          quantity: quantity,
          subtotal: itemSubtotal,
        });
      }
      // Handle regular products
      else {
        const product = productId ? productMap.get(productId as string) : undefined;
        if (!product) {
          const errorMsg = t('validation.productNotFoundInTransaction', 'Product {productId} not found').replace('{productId}', String(productId));
          return NextResponse.json({ success: false, error: errorMsg }, { status: 404 });
        }

        // Check stock (considering variations and branches) - but respect allowOutOfStockSales and trackInventory
        const trackInventory = product.trackInventory !== false; // Default to true if not set
        const allowOutOfStockSales = product.allowOutOfStockSales === true;

        if (trackInventory && !allowOutOfStockSales) {
          if (!productId) {
            return NextResponse.json({ success: false, error: t('validation.productIdMissing', 'Product ID is missing') }, { status: 400 });
          }
          const availableStock = await getProductStock(productId as string, tenantId, {
            branchId: typeof branchId === 'string' ? branchId : undefined,
            variation,
          });

          if (availableStock < quantity) {
            const errorMsg = t('validation.insufficientStockProduct', 'Insufficient stock for {productName}. Available: {available}, Requested: {requested}')
                  .replace('{productName}', product.name)
                  .replace('{available}', availableStock.toString())
                  .replace('{requested}', quantity.toString());
            return NextResponse.json(
              {
                success: false,
                error: errorMsg,
              },
              { status: 400 }
            );
          }
        }

        // Get price (variation price override or base price)
        let itemPrice = Number(product.price);
        if (variation && product.hasVariations) {
          const variationRows = await prisma.productVariation.findMany({ where: { productId: product.id } });
          const variationData = variationRows.find((v) => {
            const matchSize = !variation.size || v.size === variation.size;
            const matchColor = !variation.color || v.color === variation.color;
            const matchType = !variation.type || v.type === variation.type;
            return matchSize && matchColor && matchType;
          });
          if (variationData && variationData.price) {
            itemPrice = Number(variationData.price);
          }
        }

        // Add modifier surcharge to item price
        const modifierSurcharge = itemModifiers
          ? (itemModifiers as Array<{ price: number }>).reduce((s, m) => s + (m.price || 0), 0)
          : 0;
        const effectiveItemPrice = itemPrice + modifierSurcharge;
        const itemSubtotal = effectiveItemPrice * quantity;
        subtotal += itemSubtotal;

        transactionItems.push({
          productId: product.id,
          name: product.name,
          price: effectiveItemPrice,
          quantity: quantity,
          subtotal: itemSubtotal,
          taxExempt: product.taxExempt || false,
          zeroRated: product.zeroRated || false,
          modifiers: itemModifiers || undefined,
        });
      }
    }

    // Apply discount if provided
    let discountAmount = 0;
    let appliedDiscountCode: string | undefined;
    let appliedDiscountCategory: DiscountCategory | undefined;
    // Set once the usage-increment below succeeds; used to compensate the
    // increment if checkout fails or is replayed after this point.
    let appliedDiscountId: string | undefined;

    if (discountCode) {
      const now = new Date();
      const codeUpper = typeof discountCode === 'string' ? discountCode.toUpperCase() : '';

      // Atomic check + increment: only claims the row (and bumps usageCount)
      // when it's active, within its valid window, and under its usage limit —
      // mirrors the Mongo findOneAndUpdate filter+$inc atomicity via updateMany's
      // affected-row count.
      const claim = await prisma.discount.updateMany({
        where: {
          tenantId,
          code: codeUpper,
          isActive: true,
          validFrom: { lte: now },
          validUntil: { gte: now },
          // Only guards the "no limit" cases here; when usageLimit IS set we
          // still claim (increment) unconditionally and verify/roll back
          // below, since Prisma's updateMany where can't compare two columns
          // of the same row (no $expr equivalent).
          OR: [
            { usageLimit: null },
            { usageLimit: 0 },
            { usageLimit: { gt: 0 } },
          ],
        },
        data: { usageCount: { increment: 1 } },
      });

      let discount = claim.count > 0
        ? await prisma.discount.findFirst({ where: { tenantId, code: codeUpper } })
        : null;

      // The `usageCount < usageLimit` comparison can't be expressed inside
      // updateMany's where (no column-to-column comparator in Prisma), so
      // when a usageLimit is actually set we re-check it here and roll back
      // the increment we just applied if it turns out the limit was hit —
      // same net effect as the Mongo $expr filter, one extra round trip only
      // in the usageLimit-set case.
      if (discount && discount.usageLimit && discount.usageLimit > 0 && discount.usageCount > discount.usageLimit) {
        await prisma.discount.update({ where: { id: discount.id }, data: { usageCount: { decrement: 1 } } });
        discount = null;
      }

      if (!discount) {
        // Lookup without filters to give a specific error message
        const rawDiscount = await prisma.discount.findFirst({ where: { tenantId, code: codeUpper } });

        if (!rawDiscount || !rawDiscount.isActive) {
          return NextResponse.json(
            { success: false, error: t('validation.invalidDiscountCode', 'Invalid or inactive discount code') },
            { status: 400 }
          );
        }
        if (now < rawDiscount.validFrom || now > rawDiscount.validUntil) {
          return NextResponse.json(
            { success: false, error: t('validation.discountCodeNotValid', 'Discount code is not valid at this time') },
            { status: 400 }
          );
        }
        // Must be usage limit exceeded
        return NextResponse.json(
          { success: false, error: t('validation.discountCodeUsageLimit', 'Discount code has reached its usage limit') },
          { status: 400 }
        );
      }

      // Check minimum purchase amount (rollback usage if not met)
      const minPurchaseAmount = discount.minPurchaseAmount ? Number(discount.minPurchaseAmount) : undefined;
      if (minPurchaseAmount && subtotal < minPurchaseAmount) {
        // Rollback the usage increment
        await prisma.discount.update({ where: { id: discount.id }, data: { usageCount: { decrement: 1 } } });
        const errorMsg = t('validation.minimumPurchaseAmount', 'Minimum purchase amount of {amount} required').replace('{amount}', minPurchaseAmount.toString());
        return NextResponse.json(
          { success: false, error: errorMsg },
          { status: 400 }
        );
      }

      // Calculate discount amount using integer math to avoid floating point
      const discountValue = Number(discount.value);
      if (discount.type === 'percentage') {
        discountAmount = Math.round((subtotal * discountValue) / 100 * 100) / 100;
        if (discount.maxDiscountAmount) {
          discountAmount = Math.min(discountAmount, Number(discount.maxDiscountAmount));
        }
      } else {
        discountAmount = Math.min(discountValue, subtotal);
      }

      appliedDiscountCode = discount.code;
      appliedDiscountCategory = discount.category || 'general';
      appliedDiscountId = discount.id;
    }

    // Calculate subtotal after discount
    const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);

    // Calculate tax (if applicable)
    let taxAmount = 0;
    let taxResult: { taxAmount: number; taxRate: number; taxLabel: string; taxableAmount: number; exemptAmount: number; zeroRatedAmount: number } | null = null;
    if (typeof calculateTax === 'function') {
      const taxItems = transactionItems.map((item) => ({
        productId: item.productId ? String(item.productId) : undefined,
        productType: item.bundleId ? ('bundle' as const) : ('regular' as const),
        categoryId: item.categoryId ? item.categoryId.toString() : undefined,
        taxExempt: item.taxExempt || false,
        zeroRated: item.zeroRated || false,
        subtotal: item.subtotal,
      }));

      // Resolve the region a region-scoped tax rule should match against: the
      // transaction's branch address if one is set, else the tenant's own address.
      let taxRegion: { country?: string; state?: string; city?: string; zipCode?: string } | undefined;
      const branchForTax = typeof branchId === 'string' && branchId
        ? await prisma.branch.findFirst({ where: { id: branchId, tenantId }, select: { country: true, state: true, city: true, zipCode: true } })
        : null;
      const addressSource = branchForTax
        ? { country: branchForTax.country ?? undefined, state: branchForTax.state ?? undefined, city: branchForTax.city ?? undefined, zipCode: branchForTax.zipCode ?? undefined }
        : tenantSettings?.address;
      if (addressSource) {
        taxRegion = {
          country: addressSource.country,
          state: addressSource.state,
          city: addressSource.city,
          zipCode: addressSource.zipCode,
        };
      }

      taxResult = await calculateTax(tenantId, subtotalAfterDiscount, taxItems, tenantSettings ?? undefined, appliedDiscountCategory, taxRegion);
      taxAmount = taxResult.taxAmount;
    }

    // Calculate total after discount, tax, loyalty redemption, and tip
    const total = Math.max(0, subtotalAfterDiscount + taxAmount - loyaltyDiscountAmount + (tipAmount || 0));

    // Resolve the registered device/terminal (if any) and snapshot its identity onto the
    // transaction, so receipts remain accurate even if the device is later renamed/deactivated.
    let deviceSnapshot: { terminalId: string; deviceSerialNumber: string } | undefined;
    if (deviceId && isValidObjectId(deviceId)) {
      const device = await prisma.device.findFirst({ where: { id: deviceId, tenantId, isActive: true } });
      if (device) {
        deviceSnapshot = { terminalId: device.terminalId, deviceSerialNumber: device.serialNumber };
      }
    }

    // Handle multiple payments (split payments)
    if (isMultiplePayments && effectivePayments) {
      // Validate that all payments sum to total
      const paymentsTotal = effectivePayments.reduce((sum: number, p: PaymentInput) => sum + (p.amount || 0), 0);
      const tolerance = 0.01; // Allow small rounding differences

      if (Math.abs(paymentsTotal - total) > tolerance) {
        return NextResponse.json(
          { success: false, error: t('validation.paymentsMustEqualTotal', `Payments total (${paymentsTotal.toFixed(2)}) must equal transaction total (${total.toFixed(2)})`) },
          { status: 400 }
        );
      }

      // Determine primary payment method (use the first payment or the one with largest amount)
      const primaryPayment = effectivePayments.reduce((prev: PaymentInput, current: PaymentInput) =>
        (current.amount > (prev.amount || 0)) ? current : prev
      );
      finalPaymentMethod = primaryPayment.method || 'cash';

      // Calculate cash totals if any cash payment exists
      const cashPayments = effectivePayments.filter((p: PaymentInput) => p.method === 'cash');
      if (cashPayments.length > 0) {
        finalCashReceived = cashPayments.reduce((sum: number, p: PaymentInput) => sum + (p.cashReceived || p.amount || 0), 0);
        finalChange = cashPayments.reduce((sum: number, p: PaymentInput) => sum + (p.change || 0), 0);
      }
    } else {
      // Single payment method (existing logic)
      // Calculate change for cash payments
      if (finalPaymentMethod === 'cash' && finalCashReceived) {
        finalChange = finalCashReceived - total;
        if (finalChange < -0.009) {
          return NextResponse.json({ success: false, error: t('validation.insufficientCashReceived', 'Insufficient cash received') }, { status: 400 });
        }
        finalChange = Math.max(0, finalChange);
      }
    }

    const ALLOWED_SPLIT_METHODS = new Set([
      'cash', 'card', 'digital', 'check', 'other', 'on_account',
      'tap_to_pay', 'wallet', 'qr_code', 'bnpl',
    ]);
    if (isMultiplePayments && effectivePayments) {
      for (const p of effectivePayments) {
        if (!p.method || !ALLOWED_SPLIT_METHODS.has(p.method)) {
          return NextResponse.json(
            {
              success: false,
              error: t('validation.invalidSplitPaymentMethod', 'Invalid payment method in split: {method}').replace(
                '{method}',
                String(p.method)
              ),
            },
            { status: 400 }
          );
        }
      }
    }

    let onAccountAmountToBill = 0;
    if (isMultiplePayments && effectivePayments) {
      onAccountAmountToBill = effectivePayments.reduce(
        (s, p: PaymentInput) => s + (p.method === 'on_account' ? (p.amount || 0) : 0),
        0
      );
    } else if (finalPaymentMethod === 'on_account') {
      onAccountAmountToBill = total;
    }

    const storedPaymentMethod = normalizeTransactionPaymentMethod(finalPaymentMethod);

    // ─── Atomic section: stock + transaction + payments ───
    // Stock adjustments go through lib/stock.ts (shared with the
    // products/inventory routes owned elsewhere in this migration) which is
    // not itself a Prisma-transaction-aware call yet, so — same as the
    // pre-migration Mongoose "best effort session" pattern — it runs before
    // the atomic Prisma transaction rather than inside it. Everything this
    // route directly owns (Transaction + items + splitPayments + Payment +
    // Tenant grand-total + loyalty + on-account balance) is one
    // prisma.$transaction so those rows commit or roll back together.
    const checkoutResult = await (async () => {
      // Update stock BEFORE creating transaction (critical - must succeed)
      for (const item of items) {
        const { productId, quantity, variation, bundleId } = item;

        if (!productId && !bundleId) {
          logger.warn('Skipping stock update: missing productId and bundleId', item as unknown as Record<string, unknown>);
          continue;
        }

        if (bundleId) {
          await updateBundleStock(
            bundleId,
            tenantId,
            -quantity,
            'sale',
            {
              userId: user.userId,
              branchId: typeof branchId === 'string' ? branchId : undefined,
              reason: 'Transaction sale - bundle',
            }
          );
        } else if (productId) {
          const product = await prisma.product.findFirst({ where: { id: productId, tenantId } });
          if (product && product.trackInventory !== false) {
            await updateStock(
              productId,
              tenantId,
              -quantity,
              'sale',
              {
                userId: user.userId,
                branchId: typeof branchId === 'string' ? branchId : undefined,
                variation,
                reason: 'Transaction sale',
              }
            );
          }
        }
      }

      return dbTransaction(async (tx) => {
        const paymentRecords: Array<{ id: string; method: string; amount: Prisma.Decimal | number; status: string }> = [];
        let onAccountCreditChange: {
          customerId: string;
          amount: number;
          balanceBefore: number;
          balanceAfter: number;
        } | null = null;

        let transaction: Awaited<ReturnType<typeof tx.transaction.create>> | undefined;
        let receiptNumber = '';
        const txPayloadBase = {
          tenantId,
          branchId: branchId || undefined,
          subtotal,
          discountCode: appliedDiscountCode,
          discountCategory: appliedDiscountCategory,
          discountAmount: discountAmount > 0 ? discountAmount : undefined,
          scPwdName: (appliedDiscountCategory === 'senior' || appliedDiscountCategory === 'pwd') ? (scPwdName || undefined) : undefined,
          scPwdId: (appliedDiscountCategory === 'senior' || appliedDiscountCategory === 'pwd') ? (scPwdId || undefined) : undefined,
          taxExemptAmount: taxResult?.exemptAmount || 0,
          zeroRatedAmount: taxResult?.zeroRatedAmount || 0,
          taxAmount: taxAmount > 0 ? taxAmount : undefined,
          total,
          paymentMethod: storedPaymentMethod,
          cashReceived: storedPaymentMethod === 'cash' ? finalCashReceived : undefined,
          change: storedPaymentMethod === 'cash' ? finalChange : undefined,
          status: 'completed' as const,
          customerId: customerId || undefined,
          userId: user.userId,
          deviceId: deviceId && isValidObjectId(deviceId) ? deviceId : undefined,
          terminalId: deviceSnapshot?.terminalId,
          deviceSerialNumber: deviceSnapshot?.deviceSerialNumber,
          notes,
          orderType: orderType || undefined,
          tableNumber: tableNumber || undefined,
          tableId: tableId || undefined,
          splitCount: splitCount || undefined,
          tipAmount: tipAmount || undefined,
          ...(idempotencyKey ? { idempotencyKey } : {}),
        };

        for (let receiptAttempt = 0; receiptAttempt < 3; receiptAttempt++) {
          receiptNumber = await generateReceiptNumber(tenantId);
          try {
            transaction = await tx.transaction.create({
              data: {
                id: randomUUID(),
                ...txPayloadBase,
                receiptNumber,
                items: {
                  create: transactionItems.map((ti) => ({
                    id: randomUUID(),
                    productId: ti.productId,
                    name: ti.name,
                    price: ti.price,
                    quantity: ti.quantity,
                    subtotal: ti.subtotal,
                    modifiers: ti.modifiers
                      ? { create: ti.modifiers.map((m) => ({ id: randomUUID(), name: m.name, chosenOption: m.chosenOption, price: m.price })) }
                      : undefined,
                  })),
                },
                splitPayments: splitPayments
                  ? {
                      create: splitPayments.map((sp: { guestIndex?: number; method: string; amount: number; reference?: string }, idx: number) => ({
                        id: randomUUID(),
                        guestIndex: sp.guestIndex ?? idx,
                        method: sp.method,
                        amount: sp.amount,
                        reference: sp.reference,
                      })),
                    }
                  : undefined,
              },
              include: { items: { include: { modifiers: true } }, splitPayments: true },
            });
            break;
          } catch (createErr) {
            if (isDuplicateReceiptNumberError(createErr) && receiptAttempt < 2) {
              logger.warn('Duplicate receipt number, retrying with next sequence', { receiptNumber });
              continue;
            }
            // A concurrent duplicate request (same idempotencyKey) raced us
            // inside the transaction and won — surface it as a dedicated
            // error so the outer handler can return that transaction instead
            // of a generic failure.
            if (
              idempotencyKey &&
              createErr &&
              typeof createErr === 'object' &&
              'code' in createErr &&
              (createErr as { code?: string }).code === 'P2002' &&
              JSON.stringify((createErr as { meta?: unknown }).meta || '').includes('idempotencyKey')
            ) {
              throw new IdempotentReplayError(idempotencyKey);
            }
            throw createErr;
          }
        }

        if (!transaction) {
          throw new Error('Failed to create transaction after receipt number retries');
        }

        // BIR Grand Total Accumulator: non-resettable, all-time cumulative sales register.
        // Increments atomically with the transaction commit; never decremented on void/refund.
        await tx.tenant.update({
          where: { id: tenantId },
          data: { grandTotalSales: { increment: total }, grandTotalTransactionCount: { increment: 1 } },
        });

        for (const item of items) {
          const { productId, bundleId } = item;
          if (productId || bundleId) {
            await tx.stockMovement.updateMany({
              where: {
                productId: productId || undefined,
                tenantId,
                reason: productId ? 'Transaction sale' : 'Transaction sale - bundle',
                transactionId: null,
              },
              data: { transactionId: transaction.id },
            });
          }
        }

        if (loyaltyEnabled && loyaltyCustomer && loyaltyConfig) {
          const currentBalance = Number(loyaltyCustomer.loyaltyPointsBalance ?? 0);
          let newBalance = currentBalance;
          const loyaltyUpdate: { loyaltyPointsRedeemed?: number; loyaltyPointsEarned?: number } = {};

          if (loyaltyPointsToRedeem > 0) {
            const balanceAfterRedeem = Math.max(0, newBalance - loyaltyPointsToRedeem);
            await tx.loyaltyTransaction.create({
              data: {
                id: randomUUID(),
                tenantId,
                customerId: loyaltyCustomer.id,
                transactionId: transaction.id,
                type: 'redeem',
                points: -loyaltyPointsToRedeem,
                balanceBefore: newBalance,
                balanceAfter: balanceAfterRedeem,
                description: `Redeemed ${loyaltyPointsToRedeem} points (₱${loyaltyDiscountAmount.toFixed(2)} discount)`,
                createdById: user.userId,
              },
            });
            newBalance = balanceAfterRedeem;
            loyaltyUpdate.loyaltyPointsRedeemed = loyaltyPointsToRedeem;
          }

          const pointsEarned = Math.floor(total * loyaltyConfig.pointsPerPeso);
          if (pointsEarned > 0) {
            const balanceAfterEarn = newBalance + pointsEarned;
            await tx.loyaltyTransaction.create({
              data: {
                id: randomUUID(),
                tenantId,
                customerId: loyaltyCustomer.id,
                transactionId: transaction.id,
                type: 'earn',
                points: pointsEarned,
                balanceBefore: newBalance,
                balanceAfter: balanceAfterEarn,
                description: `Earned ${pointsEarned} points from receipt #${transaction.receiptNumber}`,
                createdById: user.userId,
              },
            });
            newBalance = balanceAfterEarn;
            loyaltyUpdate.loyaltyPointsEarned = pointsEarned;
          }

          if (Object.keys(loyaltyUpdate).length > 0) {
            await tx.transaction.update({ where: { id: transaction.id }, data: loyaltyUpdate });
          }

          await tx.customer.update({ where: { id: loyaltyCustomer.id }, data: { loyaltyPointsBalance: newBalance } });
        }

        if (body.createPaymentRecord !== false) {
          if (isMultiplePayments && effectivePayments) {
            for (const payment of effectivePayments) {
              const details: Record<string, unknown> = {};
              if (payment.method === 'cash') {
                details.cashReceived = payment.cashReceived || payment.amount;
                details.change = payment.change || 0;
              } else if (payment.method === 'card' || payment.method === 'digital') {
                details.provider = payment.provider;
                details.transactionId = payment.transactionId;
                details.cardLast4 = payment.cardLast4;
                details.cardType = payment.cardType;
                details.cardBrand = payment.cardBrand;
              } else if (payment.method === 'check') {
                details.checkNumber = payment.checkNumber;
              } else if (payment.method === 'on_account') {
                details.notes = 'On-account (customer balance)';
              }
              if (payment.notes) {
                details.notes = payment.notes;
              }

              const paymentRecord = await tx.payment.create({
                data: {
                  id: randomUUID(),
                  tenantId,
                  transactionId: transaction.id,
                  method: toPaymentRecordMethod(payment.method),
                  amount: payment.amount,
                  status: 'completed' as PaymentStatus,
                  detailsCashReceived: details.cashReceived as number | undefined,
                  detailsChange: details.change as number | undefined,
                  detailsProvider: details.provider as string | undefined,
                  detailsGatewayTxnId: details.transactionId as string | undefined,
                  detailsCardLast4: details.cardLast4 as string | undefined,
                  detailsCardType: details.cardType as string | undefined,
                  detailsCardBrand: details.cardBrand as string | undefined,
                  detailsCheckNumber: details.checkNumber as string | undefined,
                  detailsNotes: details.notes as string | undefined,
                  processedById: user.userId,
                  processedAt: new Date(),
                },
              });
              paymentRecords.push(paymentRecord);
            }
          } else {
            const details: Record<string, unknown> = {};
            if (finalPaymentMethod === 'cash') {
              details.cashReceived = finalCashReceived;
              details.change = finalChange;
            } else if (finalPaymentMethod === 'card' || finalPaymentMethod === 'digital') {
              details.provider = body.paymentProvider;
              details.transactionId = body.paymentTransactionId;
              details.cardLast4 = body.cardLast4;
              details.cardType = body.cardType;
              details.cardBrand = body.cardBrand;
            } else if (finalPaymentMethod === 'on_account') {
              details.notes = 'On-account (customer balance)';
            }

            const paymentRecord = await tx.payment.create({
              data: {
                id: randomUUID(),
                tenantId,
                transactionId: transaction.id,
                method: toPaymentRecordMethod(finalPaymentMethod),
                amount: total,
                status: 'completed' as PaymentStatus,
                detailsCashReceived: details.cashReceived as number | undefined,
                detailsChange: details.change as number | undefined,
                detailsProvider: details.provider as string | undefined,
                detailsGatewayTxnId: details.transactionId as string | undefined,
                detailsCardLast4: details.cardLast4 as string | undefined,
                detailsCardType: details.cardType as string | undefined,
                detailsCardBrand: details.cardBrand as string | undefined,
                processedById: user.userId,
                processedAt: new Date(),
              },
            });
            paymentRecords.push(paymentRecord);
          }
        }

        if (onAccountAmountToBill > 0.009 && customerId) {
          const creditCustomer = await tx.customer.findFirst({
            where: { id: customerId, tenantId, isActive: true },
            select: { id: true, accountBalance: true, creditLimit: true },
          });

          if (!creditCustomer) {
            throw new Error(t('validation.customerNotFound', 'Customer not found or inactive'));
          }

          const balanceBefore = Number(creditCustomer.accountBalance ?? 0);
          if (wouldExceedCreditLimit(balanceBefore, onAccountAmountToBill, creditCustomer.creditLimit != null ? Number(creditCustomer.creditLimit) : undefined)) {
            throw new Error(
              t('validation.creditLimitExceeded', "Sale would exceed this customer's credit limit")
            );
          }

          await tx.customer.update({
            where: { id: customerId },
            data: { accountBalance: { increment: onAccountAmountToBill } },
          });

          onAccountCreditChange = {
            customerId: String(customerId),
            amount: onAccountAmountToBill,
            balanceBefore,
            balanceAfter: balanceBefore + onAccountAmountToBill,
          };
        }

        return { transaction, paymentRecords, onAccountCreditChange };
      });
    })().catch(async (txError) => {
      if (txError instanceof IdempotentReplayError) {
        const existing = await prisma.transaction.findFirst({ where: { tenantId, idempotencyKey: txError.idempotencyKey } });
        if (existing) {
          // A concurrent request with the same idempotencyKey already created the
          // transaction and consumed the discount usage; this loser's earlier
          // usageCount increment is a duplicate and must be compensated.
          if (appliedDiscountId) {
            await prisma.discount.update({ where: { id: appliedDiscountId }, data: { usageCount: { decrement: 1 } } });
          }
          return { transaction: existing, paymentRecords: [], onAccountCreditChange: null, replay: true };
        }
      }
      // Checkout failed outright (stock conflict, DB error, etc.) — release
      // the discount usage this request reserved before the atomic section ran.
      if (appliedDiscountId) {
        await prisma.discount.update({ where: { id: appliedDiscountId }, data: { usageCount: { decrement: 1 } } });
      }
      throw txError;
    });

    if ((checkoutResult as { replay?: boolean }).replay) {
      return NextResponse.json({ success: true, data: checkoutResult.transaction }, { status: 200 });
    }

    const { transaction, paymentRecords, onAccountCreditChange } = checkoutResult as {
      transaction: NonNullable<Awaited<ReturnType<typeof prisma.transaction.create>>>;
      paymentRecords: Array<{ id: string; method: string; amount: Prisma.Decimal | number; status: string }>;
      onAccountCreditChange: { customerId: string; amount: number; balanceBefore: number; balanceAfter: number } | null;
    };

    {
      const productIdsForChannel = items
        .map((item) => item.productId)
        .filter((id): id is string => Boolean(id));
      if (productIdsForChannel.length) {
        const { pushChannelInventoryForProducts } = await import('@/lib/ecommerce/inventory-push');
        void pushChannelInventoryForProducts(tenantId.toString(), productIdsForChannel, {
          branchId: typeof branchId === 'string' ? branchId : undefined,
          stockReason: 'Transaction sale',
        });
      }
    }

    // Reset table status to 'open' after dine-in payment completes
    if (tableId && orderType === 'dine_in') {
      try {
        await prisma.posTable.updateMany({
          where: { id: tableId, tenantId },
          data: { status: 'open', currentOrderId: null },
        });
      } catch (tableErr) {
        logger.error('Failed to reset table status:', tableErr);
        // Non-critical — don't fail the response
      }
    }

    // Create audit log
    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.TRANSACTION_CREATE,
      entityType: 'transaction',
      entityId: transaction.id,
      changes: {
        receiptNumber: transaction.receiptNumber,
        total,
        itemsCount: transactionItems.length,
        paymentCount: paymentRecords.length,
        paymentIds: paymentRecords.map((p) => String(p.id)),
        isMultiplePayments: isMultiplePayments,
        onAccountCreditChange,
      },
    });

    // Fire-and-forget: post this completed sale to the general ledger.
    // Never awaited into the response path — a ledger-posting failure must
    // not fail the checkout that already committed.
    void postTransactionToLedger(transaction.id);

    // Update subscription usage
    try {
      const currentTransactionCountAfter = await prisma.transaction.count({
        where: {
          tenantId,
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1), // Start of current month
            lt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1), // Start of next month
          },
        },
      });
      await SubscriptionService.updateUsage(tenantId.toString(), {
        transactions: currentTransactionCountAfter,
      });
    } catch (usageError) {
      logger.error('Failed to update subscription usage:', usageError);
      // Don't fail the request if usage update fails
    }

    // Include payment records in response if created
    const responseData: Record<string, unknown> = { ...transaction };
    if (paymentRecords.length > 0) {
      responseData.payments = paymentRecords.map((p) => ({
        _id: p.id,
        method: p.method,
        amount: p.amount,
        status: p.status,
      }));
    }

    return NextResponse.json({ success: true, data: responseData }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Transaction failed';
    const status = getTransactionErrorStatus(error);
    logger.error('Transaction POST error:', error);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
