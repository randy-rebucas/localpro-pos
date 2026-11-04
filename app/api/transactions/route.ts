import { NextRequest, NextResponse } from 'next/server';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { validateAndSanitize, validateTransaction } from '@/lib/validation';
import { generateReceiptNumber, isDuplicateReceiptNumberError } from '@/lib/receipt';
import { updateStock, updateBundleStock, computeProductStock, insertStockMovements, StockMovementInput } from '@/lib/stock';
import {
  DuplicateKeyError,
  getRepos,
  isDuplicateKeyError,
  isTransactional,
  isValidId,
  newId,
  runInTransaction,
  type Customer,
  type DiscountCategory,
  type Payment,
  type PaymentDetails,
  type ProductBundle,
  type Transaction,
  type TransactionPaymentMethod,
} from '@/lib/db';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { getTenantSettingsById } from '@/lib/tenant';
import { checkSubscriptionLimit, SubscriptionService, checkFeatureAccess } from '@/lib/subscription';
import { logger } from '@/lib/logger';
import { calculateTax } from '@/lib/tax-calculation';
import { checkRateLimit } from '@/lib/rate-limit';
import { wouldExceedCreditLimit } from '@/lib/customer-credit';

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

function normalizeTransactionPaymentMethod(m: string): TransactionPaymentMethod {
  if (TRANSACTION_PAYMENT_METHODS.has(m)) return m as TransactionPaymentMethod;
  if (m === 'check' || m === 'other') return 'digital';
  throw new Error(`Invalid payment method: ${m}`);
}

function getTransactionErrorStatus(error: unknown): number {
  if (error && typeof error === 'object') {
    const err = error as { name?: string };
    if (err.name === 'ValidationError' || err.name === 'CastError') return 400;
    if (isDuplicateKeyError(error)) return 400;
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
  product: string;
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

    const filter = { notDisabled: true as const, ...(customerIdFilter && { customerId: customerIdFilter }) };
    const repo = getRepos().transactions;
    const transactions = await repo.listWithRefs(tenantId, filter, { page: { skip, limit } });
    const total = await repo.count(tenantId, filter);

    return NextResponse.json({
      success: true,
      data: transactions,
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
    const repos = getRepos();
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
    if (customerId && !isValidId(customerId)) {
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
      const existing = await repos.transactions.findByIdempotencyKey(tenantId, idempotencyKey);
      if (existing) {
        return NextResponse.json({ success: true, data: existing }, { status: 200 });
      }
    }

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

    // Check subscription transaction limits. The monthly count comes from the
    // subscription's usage counter; counting the month's transactions is only
    // the fallback when the counter hasn't been seeded for this month.
    const countTransactionsThisMonth = () => repos.transactions.count(tenantId, {
      createdAt: {
        gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        lt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
      }
    });
    const currentTransactionCount =
      (await SubscriptionService.getMonthlyTransactionCount(tenantId.toString())) ??
      (await countTransactionsThisMonth());
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
    let loyaltyCustomer: Customer | null = null;
    let loyaltyDiscountAmount = 0;

    try {
      await checkFeatureAccess(tenantId.toString(), 'enableLoyaltyProgram');
      loyaltyEnabled = true;
    } catch {
      // Feature not available for this plan — loyalty is silently skipped
    }

    if (loyaltyEnabled && customerId) {
      const foundConfig = await repos.loyaltyConfigs.get(tenantId);
      loyaltyConfig = foundConfig ?? { pointsPerPeso: 1, pesoPerPoint: 0.10, minRedemption: 100, isEnabled: true };

      if (!loyaltyConfig.isEnabled) {
        loyaltyEnabled = false;
      }

      if (loyaltyEnabled) {
        const customer = await repos.customers.findById(tenantId, customerId);
        if (!customer) {
          return NextResponse.json({ success: false, error: t('validation.customerNotFound', 'Customer not found') }, { status: 404 });
        }
        loyaltyCustomer = customer;

        if (loyaltyPointsToRedeem > 0) {
          const balance = customer.loyaltyPointsBalance ?? 0;
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
        ? repos.products.list(tenantId, { ids: productIds })
        : Promise.resolve([]),
      bundleIds.length > 0
        ? (repos.bundles.list(tenantId, { ids: bundleIds, isActive: true }) as Promise<ProductBundle[]>) // not populated: productId is an id
        : Promise.resolve([]),
    ]);

    const productMap = new Map(productsArray.map(p => [p._id, p]));
    const bundleMap = new Map(bundlesArray.map(b => [b._id, b]));

    // Also batch-load all products referenced by bundles
    const bundleProductIds = bundlesArray.flatMap(b => b.items.map((bi) => bi.productId));
    if (bundleProductIds.length > 0) {
      const bundleProducts = await repos.products.list(tenantId, { ids: bundleProductIds });
      for (const bp of bundleProducts) {
        if (!productMap.has(bp._id)) {
          productMap.set(bp._id, bp);
        }
      }
    }

    for (const item of items) {
      const { productId, quantity, variation, bundleId } = item;
      const itemModifiers = Array.isArray((item as any).modifiers) ? (item as any).modifiers : undefined; // eslint-disable-line @typescript-eslint/no-explicit-any

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
            // From the batch-loaded product — no extra read per item
            const availableStock = computeProductStock(bundleProduct, {
              branchId: typeof branchId === 'string' ? branchId : undefined,
              variation: bundleItem.variation,
            });

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

        const itemSubtotal = bundle.price * quantity;
        subtotal += itemSubtotal;

        transactionItems.push({
          product: bundle._id,
          name: bundle.name,
          price: bundle.price,
          quantity: quantity,
          subtotal: itemSubtotal,
          bundleId: bundle._id,
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
          // From the batch-loaded product — no extra read per item
          const availableStock = computeProductStock(product, {
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
        let itemPrice = product.price;
        if (variation && product.hasVariations && product.variations) {
          const variationData = product.variations.find((v: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
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
          ? (itemModifiers as Array<{ price: number }>).reduce((s, m) => s + (m.price || 0), 0)
          : 0;
        const effectiveItemPrice = itemPrice + modifierSurcharge;
        const itemSubtotal = effectiveItemPrice * quantity;
        subtotal += itemSubtotal;

        transactionItems.push({
          product: product._id,
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
      const normalizedCode = typeof discountCode === 'string' ? discountCode : '';

      // Atomic check + increment, so two transactions can't both pass the
      // usage-limit check. Returns the discount as it was before the increment.
      const discount = await repos.discounts.claimUsage(tenantId, normalizedCode, now);

      if (!discount) {
        // Lookup without filters to give a specific error message
        const rawDiscount = await repos.discounts.findByCode(tenantId, normalizedCode);

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
      if (discount.minPurchaseAmount && subtotal < discount.minPurchaseAmount) {
        // Rollback the usage increment
        await repos.discounts.releaseUsage(tenantId, discount._id);
        const errorMsg = t('validation.minimumPurchaseAmount', 'Minimum purchase amount of {amount} required').replace('{amount}', discount.minPurchaseAmount.toString());
        return NextResponse.json(
          { success: false, error: errorMsg },
          { status: 400 }
        );
      }

      // Calculate discount amount using integer math to avoid floating point
      if (discount.type === 'percentage') {
        discountAmount = Math.round((subtotal * discount.value) / 100 * 100) / 100;
        if (discount.maxDiscountAmount) {
          discountAmount = Math.min(discountAmount, discount.maxDiscountAmount);
        }
      } else {
        discountAmount = Math.min(discount.value, subtotal);
      }

      appliedDiscountCode = discount.code;
      appliedDiscountCategory = discount.category || 'general';
      appliedDiscountId = discount._id;
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

      // Resolve the region a region-scoped tax rule should match against: the
      // transaction's branch address if one is set, else the tenant's own address.
      let taxRegion: { country?: string; state?: string; city?: string; zipCode?: string } | undefined;
      const branchForTax = typeof branchId === 'string' && branchId
        ? await repos.branches.findById(tenantId, branchId)
        : null;
      const addressSource = branchForTax?.address || tenantSettings?.address;
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

    // Calculate total after discount, tax, and loyalty redemption
    const total = Math.max(0, subtotalAfterDiscount + taxAmount - loyaltyDiscountAmount);

    // Resolve the registered device/terminal (if any) and snapshot its identity onto the
    // transaction, so receipts remain accurate even if the device is later renamed/deactivated.
    let deviceSnapshot: { terminalId: string; deviceSerialNumber: string } | undefined;
    if (deviceId && isValidId(deviceId)) {
      const device = await repos.devices.findById(tenantId, deviceId);
      if (device?.isActive === true) {
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

    // ─── Atomic section: stock + transaction + payments (transaction when DB supports it) ───
    const checkoutResult = await runInTransaction(async (tx) => {
      const paymentRecords: Payment[] = [];
      let onAccountCreditChange: {
        customerId: string;
        amount: number;
        balanceBefore: number;
        balanceAfter: number;
      } | null = null;

      // The transaction's _id is generated up front so stock movements are written
      // with it directly (batched into one insert below).
      const transactionObjectId = newId();
      const stockMovements: StockMovementInput[] = [];

      // Update stock BEFORE creating transaction (critical - must succeed)
      try {
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
                transactionId: transactionObjectId,
                movements: stockMovements,
              },
              tx,
              { bundle: bundleMap.get(bundleId), products: productMap }
            );
          } else if (productId) {
            const product = productMap.get(productId as string);
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
                  transactionId: transactionObjectId,
                  product,
                  movements: stockMovements,
                },
                tx
              );
            }
          }
        }
      } catch (stockErr) {
        // Without a transaction (standalone fallback) the stock already
        // decremented for earlier lines stays applied — keep their movement records
        if (!isTransactional(tx)) await insertStockMovements(stockMovements);
        throw stockErr;
      }
      await insertStockMovements(stockMovements, tx);

      let transaction: Transaction | undefined;
      let receiptNumber = '';
      const txPayloadBase = {
        branchId: branchId || undefined,
        items: transactionItems,
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
        deviceId: deviceId && isValidId(deviceId) ? deviceId : undefined,
        terminalId: deviceSnapshot?.terminalId,
        deviceSerialNumber: deviceSnapshot?.deviceSerialNumber,
        notes,
        orderType: orderType || undefined,
        tableNumber: tableNumber || undefined,
        tableId: tableId || undefined,
        splitCount: splitCount || undefined,
        splitPayments: splitPayments || undefined,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      };

      for (let receiptAttempt = 0; receiptAttempt < 3; receiptAttempt++) {
        receiptNumber = await generateReceiptNumber(tenantId);
        try {
          transaction = await repos.transactions.create(
            tenantId,
            { ...txPayloadBase, _id: transactionObjectId, receiptNumber },
            { tx }
          );
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
          if (idempotencyKey && createErr instanceof DuplicateKeyError && createErr.field === 'idempotencyKey') {
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
      await repos.tenants.addToGrandTotals(tenantId, total, { tx });

      if (loyaltyEnabled && loyaltyCustomer && loyaltyConfig) {
        const currentBalance = loyaltyCustomer.loyaltyPointsBalance ?? 0;
        let newBalance = currentBalance;
        const loyaltyUpdate: { loyaltyPointsEarned?: number; loyaltyPointsRedeemed?: number } = {};

        if (loyaltyPointsToRedeem > 0) {
          const balanceAfterRedeem = Math.max(0, newBalance - loyaltyPointsToRedeem);
          await repos.loyaltyTransactions.create(tenantId, {
            customerId: loyaltyCustomer._id,
            transactionId: transaction._id,
            type: 'redeem',
            points: -loyaltyPointsToRedeem,
            balanceBefore: newBalance,
            balanceAfter: balanceAfterRedeem,
            description: `Redeemed ${loyaltyPointsToRedeem} points (₱${loyaltyDiscountAmount.toFixed(2)} discount)`,
            createdBy: user.userId,
          }, { tx });
          newBalance = balanceAfterRedeem;
          loyaltyUpdate.loyaltyPointsRedeemed = loyaltyPointsToRedeem;
        }

        const pointsEarned = Math.floor(total * loyaltyConfig.pointsPerPeso);
        if (pointsEarned > 0) {
          const balanceAfterEarn = newBalance + pointsEarned;
          await repos.loyaltyTransactions.create(tenantId, {
            customerId: loyaltyCustomer._id,
            transactionId: transaction._id,
            type: 'earn',
            points: pointsEarned,
            balanceBefore: newBalance,
            balanceAfter: balanceAfterEarn,
            description: `Earned ${pointsEarned} points from receipt #${transaction.receiptNumber}`,
            createdBy: user.userId,
          }, { tx });
          newBalance = balanceAfterEarn;
          loyaltyUpdate.loyaltyPointsEarned = pointsEarned;
        }

        if (Object.keys(loyaltyUpdate).length > 0) {
          await repos.transactions.setLoyaltyPoints(tenantId, transaction._id, loyaltyUpdate, { tx });
        }

        await repos.customers.setBalances(tenantId, loyaltyCustomer._id, { loyaltyPointsBalance: newBalance }, { tx });
      }

      if (body.createPaymentRecord !== false) {
        if (isMultiplePayments && effectivePayments) {
          for (const payment of effectivePayments) {
            const paymentDetails: PaymentDetails = {};
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

            paymentRecords.push(await repos.payments.create(tenantId, {
              transactionId: transaction._id,
              method: toPaymentRecordMethod(payment.method),
              amount: payment.amount,
              status: 'completed',
              details: Object.keys(paymentDetails).length > 0 ? paymentDetails : undefined,
              processedBy: user.userId,
              processedAt: new Date(),
            }, { tx }));
          }
        } else {
          const paymentDetails: PaymentDetails = {};
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

          paymentRecords.push(await repos.payments.create(tenantId, {
            transactionId: transaction._id,
            method: toPaymentRecordMethod(finalPaymentMethod),
            amount: total,
            status: 'completed',
            details: Object.keys(paymentDetails).length > 0 ? paymentDetails : undefined,
            processedBy: user.userId,
            processedAt: new Date(),
          }, { tx }));
        }
      }

      if (onAccountAmountToBill > 0.009 && customerId) {
        const creditCustomer = await repos.customers.findOne(
          tenantId,
          { ids: [customerId], isActive: true },
          { select: 'accountBalance creditLimit', tx }
        );

        if (!creditCustomer) {
          throw new Error(t('validation.customerNotFound', 'Customer not found or inactive'));
        }

        const balanceBefore = creditCustomer.accountBalance ?? 0;
        if (wouldExceedCreditLimit(balanceBefore, onAccountAmountToBill, creditCustomer.creditLimit)) {
          throw new Error(
            t('validation.creditLimitExceeded', "Sale would exceed this customer's credit limit")
          );
        }

        await repos.customers.adjustAccountBalance(tenantId, customerId, onAccountAmountToBill, { tx });

        onAccountCreditChange = {
          customerId: String(customerId),
          amount: onAccountAmountToBill,
          balanceBefore,
          balanceAfter: balanceBefore + onAccountAmountToBill,
        };
      }

      return { transaction, paymentRecords, onAccountCreditChange };
    }).catch(async (txError) => {
      if (txError instanceof IdempotentReplayError) {
        const existing = await repos.transactions.findByIdempotencyKey(tenantId, txError.idempotencyKey);
        if (existing) {
          // A concurrent request with the same idempotencyKey already created the
          // transaction and consumed the discount usage; this loser's earlier
          // usageCount increment is a duplicate and must be compensated.
          if (appliedDiscountId) {
            await repos.discounts.releaseUsage(tenantId, appliedDiscountId);
          }
          return { transaction: existing, paymentRecords: [] as Payment[], onAccountCreditChange: null, replay: true };
        }
      }
      // Checkout failed outright (stock conflict, DB error, etc.) — release
      // the discount usage this request reserved before the atomic section ran.
      if (appliedDiscountId) {
        await repos.discounts.releaseUsage(tenantId, appliedDiscountId);
      }
      throw txError;
    });

    if ((checkoutResult as { replay?: boolean }).replay) {
      return NextResponse.json({ success: true, data: checkoutResult.transaction }, { status: 200 });
    }

    const { transaction, paymentRecords, onAccountCreditChange } = checkoutResult;

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
    if (tableId && orderType === 'dine-in') {
      try {
        await repos.tables.update(tenantId, tableId, { status: 'open', currentOrderId: undefined });
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
      entityId: transaction._id.toString(),
      changes: {
        receiptNumber: transaction.receiptNumber,
        total,
        itemsCount: transactionItems.length,
        paymentCount: paymentRecords.length,
        paymentIds: paymentRecords.map((p) => String(p._id)),
        isMultiplePayments: isMultiplePayments,
        onAccountCreditChange,
      },
    });

    // Update subscription usage (one $inc instead of re-counting the month)
    try {
      await SubscriptionService.recordTransaction(tenantId.toString(), countTransactionsThisMonth);
    } catch (usageError) {
      logger.error('Failed to update subscription usage:', usageError);
      // Don't fail the request if usage update fails
    }

    // Include payment records in response if created
    const responseData = {
      ...transaction,
      ...(paymentRecords.length > 0 && {
        payments: paymentRecords.map((p) => ({ _id: p._id, method: p.method, amount: p.amount, status: p.status })),
      }),
    };

    return NextResponse.json({ success: true, data: responseData }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Transaction failed';
    const status = getTransactionErrorStatus(error);
    logger.error('Transaction POST error:', error);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

