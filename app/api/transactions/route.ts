import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireTenantAccess } from '@/lib/api-tenant';
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
import { runInTransaction, type PrismaTx } from '@/lib/db-transaction';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
function toPaymentRecordMethod(
  m: string
): 'cash' | 'card' | 'digital' | 'check' | 'other' | 'on_account' {
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

function normalizeTransactionPaymentMethod(m: string): string {
  if (TRANSACTION_PAYMENT_METHODS.has(m)) return m;
  if (m === 'check' || m === 'other') return 'digital';
  throw new Error(`Invalid payment method: ${m}`);
}

/** OrderType's Prisma client value uses underscores (dine_in), the API contract uses hyphens (dine-in). */
function toOrderTypeEnum(v?: string): 'dine_in' | 'takeout' | 'delivery' | undefined {
  if (v === 'dine-in') return 'dine_in';
  if (v === 'takeout' || v === 'delivery') return v;
  return undefined;
}

function getTransactionErrorStatus(error: unknown): number {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return 400;
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

interface TransactionItemRecord {
  product?: string;
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
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
    } catch (authError: unknown) {
      const msg = authError instanceof Error ? authError.message : '';
      return NextResponse.json(
        { success: false, error: msg.includes('Forbidden') ? 'Forbidden' : 'Unauthorized' },
        { status: msg.includes('Forbidden') ? 403 : 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const rawLimit = parseInt(searchParams.get('limit') || '50');
    const limit = Math.min(Math.max(1, rawLimit), 200); // cap at 200
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const skip = (page - 1) * limit;
    const customerIdFilter = searchParams.get('customerId');

    const where: Prisma.TransactionWhereInput = { tenantId, isActive: true };
    if (customerIdFilter) {
      where.customerId = customerIdFilter;
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
        include: {
          items: { include: { product: { select: { name: true } } } },
          customer: { select: { firstName: true, lastName: true } },
          user: { select: { name: true, email: true } },
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    const data = transactions.map((t) => serializeTransaction(t));

    return NextResponse.json({
      success: true,
      data,
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

// Converts Decimal/BigInt fields to plain numbers and maps `id` -> `_id` for
// API-contract compatibility with the frontend (which expects `_id`).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeTransaction(t: any): Record<string, unknown> {
  const { id, items, customer, user, ...rest } = t;
  const out: Record<string, unknown> = { _id: id, ...rest };
  for (const key of [
    'subtotal', 'discountAmount', 'taxExemptAmount', 'zeroRatedAmount', 'taxAmount',
    'total', 'cashReceived', 'change', 'displayTotal',
  ]) {
    if (out[key] !== null && out[key] !== undefined) out[key] = Number(out[key]);
  }
  if (items) {
    out.items = items.map((item: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      ...item,
      _id: item.id,
      product: item.product ? { _id: item.productId, name: item.product.name } : item.productId,
      price: Number(item.price),
      subtotal: Number(item.subtotal),
    }));
  }
  if (customer) out.customerId = { _id: t.customerId, firstName: customer.firstName, lastName: customer.lastName };
  if (user) out.userId = { _id: t.userId, name: user.name, email: user.email };
  return out;
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

    const rl = checkRateLimit(`transactions:${user.userId}`, 120, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json();
    const t = await getValidationTranslatorFromRequest(request);
    const { data, errors } = validateAndSanitize(body, validateTransaction, t);

    if (errors.length > 0) {
      return NextResponse.json(
        { success: false, errors },
        { status: 400 }
      );
    }

    const { items, paymentMethod, cashReceived, notes, discountCode, branchId, payments, scPwdName, scPwdId, deviceId } = data as unknown as TransactionInput;
    const customerId = body.customerId as string | undefined;
    if (customerId && !UUID_RE.test(customerId)) {
      return NextResponse.json({ success: false, error: 'Invalid customer ID' }, { status: 400 });
    }
    const loyaltyPointsToRedeem = typeof body.loyaltyPointsToRedeem === 'number' ? Math.floor(body.loyaltyPointsToRedeem) : 0;

    // Restaurant & split-billing fields
    const rawOrderType = typeof body.orderType === 'string' ? body.orderType : undefined;
    const orderType =
      rawOrderType && ['dine-in', 'takeout', 'delivery'].includes(rawOrderType)
        ? rawOrderType
        : undefined;
    const tableNumber = typeof body.tableNumber === 'string' ? body.tableNumber : undefined;
    const tableId = typeof body.tableId === 'string' ? body.tableId : undefined;
    const splitCount = typeof body.splitCount === 'number' ? body.splitCount : undefined;
    const splitPayments = Array.isArray(body.splitPayments) ? body.splitPayments : undefined;

    // Check subscription transaction limits
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const nextMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
    const currentTransactionCount = await prisma.transaction.count({
      where: { tenantId, createdAt: { gte: monthStart, lt: nextMonthStart } },
    });
    try {
      await checkSubscriptionLimit(tenantId, 'maxTransactions', currentTransactionCount);
    } catch (limitError: unknown) {
      return NextResponse.json(
        { success: false, error: (limitError as Error).message },
        { status: 403 }
      );
    }

    // ─── Loyalty: pre-validate customer and redemption ───
    let loyaltyEnabled = false;
    let loyaltyConfig: { pointsPerPeso: number; pesoPerPoint: number; minRedemption: number; isEnabled: boolean } | null = null;
    let loyaltyCustomer: { id: string; loyaltyPointsBalance: number } | null = null;
    let loyaltyDiscountAmount = 0;

    try {
      await checkFeatureAccess(tenantId, 'enableLoyaltyProgram');
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
          return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
        }
        loyaltyCustomer = { id: customer.id, loyaltyPointsBalance: customer.loyaltyPointsBalance ?? 0 };

        if (loyaltyPointsToRedeem > 0) {
          const balance = loyaltyCustomer.loyaltyPointsBalance;
          if (loyaltyPointsToRedeem < loyaltyConfig.minRedemption) {
            return NextResponse.json(
              { success: false, error: `Minimum ${loyaltyConfig.minRedemption} points required for redemption` },
              { status: 400 }
            );
          }
          if (loyaltyPointsToRedeem > balance) {
            return NextResponse.json(
              { success: false, error: `Insufficient loyalty points. Balance: ${balance}` },
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
    const productIds = items.filter((i) => i.productId && !i.bundleId).map((i) => i.productId as string);
    const bundleIds = items.filter((i) => i.bundleId).map((i) => i.bundleId as string);

    const [productsArray, bundlesArray] = await Promise.all([
      productIds.length > 0
        ? prisma.product.findMany({ where: { id: { in: productIds }, tenantId } })
        : Promise.resolve([]),
      bundleIds.length > 0
        ? prisma.productBundle.findMany({ where: { id: { in: bundleIds }, tenantId, isActive: true }, include: { items: true } })
        : Promise.resolve([]),
    ]);

    const productMap = new Map(productsArray.map((p) => [p.id, p]));
    const bundleMap = new Map(bundlesArray.map((b) => [b.id, b]));

    // Also batch-load all products referenced by bundles
    const bundleProductIds = bundlesArray.flatMap((b) => b.items.map((bi) => bi.productId));
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
      const itemModifiers = Array.isArray((item as unknown as Record<string, unknown>).modifiers)
        ? ((item as unknown as Record<string, unknown>).modifiers as Array<{ name: string; chosenOption: string; price: number }>)
        : undefined;

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

          const trackInventory = bundleProduct.trackInventory !== false;
          const allowOutOfStockSales = bundleProduct.allowOutOfStockSales === true;

          if (trackInventory && !allowOutOfStockSales) {
            const availableStock = await getProductStock(
              bundleItem.productId,
              tenantId,
              {
                branchId: typeof branchId === 'string' ? branchId : undefined,
                variation: (bundleItem.variation as VariationInput | null) ?? undefined,
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
          product: undefined,
          bundleId: bundle.id,
          name: bundle.name,
          price: bundlePrice,
          quantity: quantity,
          subtotal: itemSubtotal,
        });
      }
      // Handle regular products
      else {
        const product = productId ? productMap.get(productId) : undefined;
        if (!product) {
          const errorMsg = t('validation.productNotFoundInTransaction', 'Product {productId} not found').replace('{productId}', String(productId));
          return NextResponse.json({ success: false, error: errorMsg }, { status: 404 });
        }

        // Check stock (considering variations and branches) - but respect allowOutOfStockSales and trackInventory
        const trackInventory = product.trackInventory !== false;
        const allowOutOfStockSales = product.allowOutOfStockSales === true;

        if (trackInventory && !allowOutOfStockSales) {
          if (!productId) {
            return NextResponse.json({ success: false, error: t('validation.productIdMissing', 'Product ID is missing') }, { status: 400 });
          }
          const availableStock = await getProductStock(productId, tenantId, {
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
        if (variation && product.hasVariations && product.variations) {
          const variations = product.variations as unknown as Array<{ size?: string; color?: string; type?: string; price?: number }>;
          const variationData = variations.find((v) => {
            const matchSize = !variation.size || v.size === variation.size;
            const matchColor = !variation.color || v.color === variation.color;
            const matchType = !variation.type || v.type === variation.type;
            return matchSize && matchColor && matchType;
          });
          if (variationData && variationData.price) {
            itemPrice = variationData.price;
          }
        }

        // Add modifier surcharge to item price
        const modifierSurcharge = itemModifiers
          ? itemModifiers.reduce((s, m) => s + (m.price || 0), 0)
          : 0;
        const effectiveItemPrice = itemPrice + modifierSurcharge;
        const itemSubtotal = effectiveItemPrice * quantity;
        subtotal += itemSubtotal;

        transactionItems.push({
          product: product.id,
          name: product.name,
          price: effectiveItemPrice,
          quantity: quantity,
          subtotal: itemSubtotal,
          categoryId: product.categoryId ?? undefined,
          taxExempt: product.taxExempt || false,
          zeroRated: product.zeroRated || false,
          modifiers: itemModifiers || undefined,
        });
      }
    }

    // Apply discount if provided
    let discountAmount = 0;
    let appliedDiscountCode: string | undefined;
    let appliedDiscountCategory: string | undefined;

    if (discountCode) {
      const now = new Date();
      const code = typeof discountCode === 'string' ? discountCode.toUpperCase() : '';

      // Atomic check + increment: a single UPDATE...WHERE...RETURNING guarantees
      // the validity/active/usage-limit check and the increment happen together,
      // preventing race conditions where two transactions pass the check simultaneously.
      const updated = await prisma.$queryRaw<Array<{
        id: string; code: string; type: string; value: string; category: string;
        min_purchase_amount: string | null; max_discount_amount: string | null;
      }>>`
        UPDATE discounts
        SET usage_count = usage_count + 1
        WHERE tenant_id = ${tenantId}::uuid
          AND code = ${code}
          AND is_active = true
          AND valid_from <= ${now}
          AND valid_until >= ${now}
          AND (usage_limit IS NULL OR usage_count < usage_limit)
        RETURNING id, code, type, value, category, min_purchase_amount, max_discount_amount
      `;

      const discount = updated[0];

      if (!discount) {
        // Lookup without filters to give a specific error message
        const rawDiscount = await prisma.discount.findFirst({ where: { tenantId, code } });

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

      const minPurchaseAmount = discount.min_purchase_amount ? Number(discount.min_purchase_amount) : null;
      const maxDiscountAmount = discount.max_discount_amount ? Number(discount.max_discount_amount) : null;
      const discountValue = Number(discount.value);

      // Check minimum purchase amount (rollback usage if not met)
      if (minPurchaseAmount && subtotal < minPurchaseAmount) {
        await prisma.discount.update({ where: { id: discount.id }, data: { usageCount: { decrement: 1 } } });
        const errorMsg = t('validation.minimumPurchaseAmount', 'Minimum purchase amount of {amount} required').replace('{amount}', minPurchaseAmount.toString());
        return NextResponse.json(
          { success: false, error: errorMsg },
          { status: 400 }
        );
      }

      // Calculate discount amount using integer math to avoid floating point
      if (discount.type === 'percentage') {
        discountAmount = Math.round((subtotal * discountValue) / 100 * 100) / 100;
        if (maxDiscountAmount) {
          discountAmount = Math.min(discountAmount, maxDiscountAmount);
        }
      } else {
        discountAmount = Math.min(discountValue, subtotal);
      }

      appliedDiscountCode = discount.code;
      appliedDiscountCategory = discount.category || 'general';
    }

    // Calculate subtotal after discount
    const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);

    // Calculate tax (if applicable)
    let taxAmount = 0;
    let taxResult: { taxAmount: number; taxRate: number; taxLabel: string; taxableAmount: number; exemptAmount: number; zeroRatedAmount: number } | null = null;
    if (typeof calculateTax === 'function') {
      const taxItems = transactionItems.map((item) => ({
        productId: item.product ? String(item.product) : undefined,
        productType: item.bundleId ? ('bundle' as const) : ('regular' as const),
        categoryId: item.categoryId ? item.categoryId.toString() : undefined,
        taxExempt: item.taxExempt || false,
        zeroRated: item.zeroRated || false,
        subtotal: item.subtotal,
      }));
      taxResult = await calculateTax(tenantId, subtotalAfterDiscount, taxItems, tenantSettings ?? undefined, appliedDiscountCategory);
      taxAmount = taxResult.taxAmount;
    }

    // Calculate total after discount, tax, and loyalty redemption
    const total = Math.max(0, subtotalAfterDiscount + taxAmount - loyaltyDiscountAmount);

    // Resolve the registered device/terminal (if any) and snapshot its identity onto the
    // transaction, so receipts remain accurate even if the device is later renamed/deactivated.
    let deviceSnapshot: { terminalId: string; deviceSerialNumber: string } | undefined;
    if (deviceId && UUID_RE.test(deviceId)) {
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

    // ─── Atomic section: stock + transaction + payments (Serializable Postgres transaction) ───
    const checkoutResult = await runInTransaction(async (tx: PrismaTx) => {
      const paymentRecords: Array<{ id: string; method: string; amount: number; status: string }> = [];
      let onAccountCreditChange: {
        customerId: string;
        amount: number;
        balanceBefore: number;
        balanceAfter: number;
      } | null = null;

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
            },
            tx
          );
        } else if (productId) {
          const product = await tx.product.findFirst({ where: { id: productId, tenantId } });
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
              },
              tx
            );
          }
        }
      }

      let transaction: Awaited<ReturnType<typeof tx.transaction.create>> | undefined;
      let receiptNumber = '';

      for (let receiptAttempt = 0; receiptAttempt < 3; receiptAttempt++) {
        receiptNumber = await generateReceiptNumber(tenantId);
        try {
          transaction = await tx.transaction.create({
            data: {
              tenantId,
              branchId: branchId || undefined,
              subtotal,
              discountCode: appliedDiscountCode,
              discountCategory: appliedDiscountCategory as never,
              discountAmount: discountAmount > 0 ? discountAmount : undefined,
              scPwdName: (appliedDiscountCategory === 'senior' || appliedDiscountCategory === 'pwd') ? (scPwdName || undefined) : undefined,
              scPwdId: (appliedDiscountCategory === 'senior' || appliedDiscountCategory === 'pwd') ? (scPwdId || undefined) : undefined,
              taxExemptAmount: taxResult?.exemptAmount || 0,
              zeroRatedAmount: taxResult?.zeroRatedAmount || 0,
              taxAmount: taxAmount > 0 ? taxAmount : undefined,
              total,
              paymentMethod: storedPaymentMethod as never,
              cashReceived: storedPaymentMethod === 'cash' ? finalCashReceived : undefined,
              change: storedPaymentMethod === 'cash' ? finalChange : undefined,
              status: 'completed',
              customerId: customerId || undefined,
              userId: user.userId,
              deviceId: deviceId && UUID_RE.test(deviceId) ? deviceId : undefined,
              terminalId: deviceSnapshot?.terminalId,
              deviceSerialNumber: deviceSnapshot?.deviceSerialNumber,
              notes,
              orderType: toOrderTypeEnum(orderType),
              tableNumber: tableNumber || undefined,
              tableId: tableId || undefined,
              splitCount: splitCount || undefined,
              receiptNumber,
              items: {
                create: transactionItems.map((item) => ({
                  productId: item.product,
                  name: item.name,
                  price: item.price,
                  quantity: item.quantity,
                  subtotal: item.subtotal,
                  modifiers: item.modifiers ?? undefined,
                })),
              },
              splitPayments: splitPayments
                ? {
                    create: (splitPayments as Array<{ guestIndex: number; method: string; amount: number; reference?: string }>).map((sp) => ({
                      guestIndex: sp.guestIndex,
                      method: sp.method,
                      amount: sp.amount,
                      reference: sp.reference,
                    })),
                  }
                : undefined,
            },
          });
          break;
        } catch (createErr) {
          if (isDuplicateReceiptNumberError(createErr) && receiptAttempt < 2) {
            logger.warn('Duplicate receipt number, retrying with next sequence', { receiptNumber });
            continue;
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
        const currentBalance = loyaltyCustomer.loyaltyPointsBalance;
        let newBalance = currentBalance;
        const loyaltyUpdate: Record<string, number> = {};

        if (loyaltyPointsToRedeem > 0) {
          const balanceAfterRedeem = Math.max(0, newBalance - loyaltyPointsToRedeem);
          await tx.loyaltyTransaction.create({
            data: {
              tenantId,
              customerId: loyaltyCustomer.id,
              transactionId: transaction.id,
              type: 'redeem',
              points: -loyaltyPointsToRedeem,
              balanceBefore: newBalance,
              balanceAfter: balanceAfterRedeem,
              description: `Redeemed ${loyaltyPointsToRedeem} points (₱${loyaltyDiscountAmount.toFixed(2)} discount)`,
              createdBy: user.userId,
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
              tenantId,
              customerId: loyaltyCustomer.id,
              transactionId: transaction.id,
              type: 'earn',
              points: pointsEarned,
              balanceBefore: newBalance,
              balanceAfter: balanceAfterEarn,
              description: `Earned ${pointsEarned} points from receipt #${transaction.receiptNumber}`,
              createdBy: user.userId,
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
            const paymentDetails: Record<string, unknown> = {};
            if (payment.method === 'cash') {
              paymentDetails.cashReceived = payment.cashReceived || payment.amount;
              paymentDetails.change = payment.change || 0;
            } else if (payment.method === 'card' || payment.method === 'digital') {
              paymentDetails.provider = payment.provider;
              paymentDetails.transactionId = payment.transactionId;
              paymentDetails.cardLast4 = payment.cardLast4;
              paymentDetails.cardType = payment.cardType;
              paymentDetails.cardBrand = payment.cardBrand;
            } else if (payment.method === 'check') {
              paymentDetails.checkNumber = payment.checkNumber;
            } else if (payment.method === 'on_account') {
              paymentDetails.notes = 'On-account (customer balance)';
            }
            if (payment.notes) {
              paymentDetails.notes = payment.notes;
            }

            const paymentRecord = await tx.payment.create({
              data: {
                tenantId,
                transactionId: transaction.id,
                method: toPaymentRecordMethod(payment.method),
                amount: payment.amount,
                status: 'completed',
                details: Object.keys(paymentDetails).length > 0 ? (paymentDetails as Prisma.InputJsonValue) : undefined,
                processedBy: user.userId,
                processedAt: new Date(),
              },
            });
            paymentRecords.push({ id: paymentRecord.id, method: paymentRecord.method, amount: Number(paymentRecord.amount), status: paymentRecord.status });
          }
        } else {
          const paymentDetails: Record<string, unknown> = {};
          if (finalPaymentMethod === 'cash') {
            paymentDetails.cashReceived = finalCashReceived;
            paymentDetails.change = finalChange;
          } else if (finalPaymentMethod === 'card' || finalPaymentMethod === 'digital') {
            paymentDetails.provider = body.paymentProvider;
            paymentDetails.transactionId = body.paymentTransactionId;
            paymentDetails.cardLast4 = body.cardLast4;
            paymentDetails.cardType = body.cardType;
            paymentDetails.cardBrand = body.cardBrand;
          } else if (finalPaymentMethod === 'on_account') {
            paymentDetails.notes = 'On-account (customer balance)';
          }

          const paymentRecord = await tx.payment.create({
            data: {
              tenantId,
              transactionId: transaction.id,
              method: toPaymentRecordMethod(finalPaymentMethod),
              amount: total,
              status: 'completed',
              details: Object.keys(paymentDetails).length > 0 ? (paymentDetails as Prisma.InputJsonValue) : undefined,
              processedBy: user.userId,
              processedAt: new Date(),
            },
          });
          paymentRecords.push({ id: paymentRecord.id, method: paymentRecord.method, amount: Number(paymentRecord.amount), status: paymentRecord.status });
        }
      }

      if (onAccountAmountToBill > 0.009 && customerId) {
        const creditCustomer = await tx.customer.findFirst({
          where: { id: customerId, tenantId, isActive: true },
          select: { accountBalance: true, creditLimit: true },
        });

        if (!creditCustomer) {
          throw new Error(t('validation.customerNotFound', 'Customer not found or inactive'));
        }

        const balanceBefore = Number(creditCustomer.accountBalance ?? 0);
        const creditLimit = creditCustomer.creditLimit !== null ? Number(creditCustomer.creditLimit) : null;
        if (wouldExceedCreditLimit(balanceBefore, onAccountAmountToBill, creditLimit)) {
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

    const { transaction, paymentRecords, onAccountCreditChange } = checkoutResult;

    {
      const productIdsForChannel = items
        .map((item) => item.productId)
        .filter((id): id is string => Boolean(id));
      if (productIdsForChannel.length) {
        const { pushChannelInventoryForProducts } = await import('@/lib/ecommerce/inventory-push');
        void pushChannelInventoryForProducts(tenantId, productIdsForChannel, {
          branchId: typeof branchId === 'string' ? branchId : undefined,
          stockReason: 'Transaction sale',
        });
      }
    }

    // Reset table status to 'open' after dine-in payment completes
    if (tableId && orderType === 'dine-in') {
      try {
        await prisma.table.updateMany({
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

    // Update subscription usage
    try {
      const currentTransactionCount = await prisma.transaction.count({
        where: { tenantId, createdAt: { gte: monthStart, lt: nextMonthStart } },
      });
      await SubscriptionService.updateUsage(tenantId, {
        transactions: currentTransactionCount,
      });
    } catch (usageError) {
      logger.error('Failed to update subscription usage:', usageError);
      // Don't fail the request if usage update fails
    }

    // Include payment records in response if created
    const responseData: Record<string, unknown> = {
      _id: transaction.id,
      ...transaction,
      subtotal: Number(transaction.subtotal),
      discountAmount: transaction.discountAmount !== null ? Number(transaction.discountAmount) : null,
      taxExemptAmount: Number(transaction.taxExemptAmount),
      zeroRatedAmount: Number(transaction.zeroRatedAmount),
      taxAmount: Number(transaction.taxAmount),
      total: Number(transaction.total),
      cashReceived: transaction.cashReceived !== null ? Number(transaction.cashReceived) : null,
      change: transaction.change !== null ? Number(transaction.change) : null,
    };
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
