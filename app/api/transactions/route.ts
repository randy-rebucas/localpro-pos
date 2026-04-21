import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import Payment from '@/models/Payment';
import Product from '@/models/Product';
import Discount from '@/models/Discount';
import { requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { validateAndSanitize, validateTransaction } from '@/lib/validation';
import { generateReceiptNumber } from '@/lib/receipt';
import { updateStock, updateBundleStock, getProductStock } from '@/lib/stock';
import ProductBundle from '@/models/ProductBundle';
import StockMovement from '@/models/StockMovement';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { getTenantSettingsById } from '@/lib/tenant';
import { checkSubscriptionLimit, SubscriptionService, checkFeatureAccess } from '@/lib/subscription';
import { logger } from '@/lib/logger';
import { calculateTax } from '@/lib/tax-calculation';
import Customer from '@/models/Customer';
import LoyaltyConfig from '@/models/LoyaltyConfig';
import LoyaltyTransaction from '@/models/LoyaltyTransaction';
import Table from '@/models/Table';
import { checkRateLimit } from '@/lib/rate-limit';

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

interface TransactionItemRecord {
  product: unknown;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
  bundleId?: unknown;
  categoryId?: string;
  taxExempt?: boolean;
  modifiers?: Array<{ name: string; chosenOption: string; price: number }>;
}

export async function GET(request: NextRequest) {
  try {
    await connectDB();
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

    const txQuery: Record<string, unknown> = { tenantId, isActive: { $ne: false } };
    if (customerIdFilter) {
      txQuery.customerId = customerIdFilter;
    }

    const transactions = await Transaction.find(txQuery)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate('items.product', 'name')
      .lean();

    const total = await Transaction.countDocuments(txQuery);

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
    await connectDB();
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

    const { items, paymentMethod, cashReceived, notes, discountCode, branchId, payments } = data as unknown as TransactionInput;
    const customerId = body.customerId as string | undefined;
    const loyaltyPointsToRedeem = typeof body.loyaltyPointsToRedeem === 'number' ? Math.floor(body.loyaltyPointsToRedeem) : 0;

    // Restaurant & split-billing fields
    const orderType = typeof body.orderType === 'string' ? body.orderType : undefined;
    const tableNumber = typeof body.tableNumber === 'string' ? body.tableNumber : undefined;
    const tableId = typeof body.tableId === 'string' ? body.tableId : undefined;
    const splitCount = typeof body.splitCount === 'number' ? body.splitCount : undefined;
    const splitPayments = Array.isArray(body.splitPayments) ? body.splitPayments : undefined;

    // Check subscription transaction limits
    const currentTransactionCount = await Transaction.countDocuments({
      tenantId,
      createdAt: {
        $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        $lt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
      }
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let loyaltyCustomer: any = null;
    let loyaltyDiscountAmount = 0;

    try {
      await checkFeatureAccess(tenantId.toString(), 'enableLoyaltyProgram');
      loyaltyEnabled = true;
    } catch {
      // Feature not available for this plan — loyalty is silently skipped
    }

    if (loyaltyEnabled && customerId) {
      const foundConfig = await LoyaltyConfig.findOne({ tenantId }).lean();
      loyaltyConfig = foundConfig ?? { pointsPerPeso: 1, pesoPerPoint: 0.10, minRedemption: 100, isEnabled: true };

      if (!loyaltyConfig.isEnabled) {
        loyaltyEnabled = false;
      }

      if (loyaltyEnabled) {
        const customer = await Customer.findOne({ _id: customerId, tenantId });
        if (!customer) {
          return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
        }
        loyaltyCustomer = customer;

        if (loyaltyPointsToRedeem > 0) {
          const balance = customer.loyaltyPointsBalance ?? 0;
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
    const productIds = items.filter(i => i.productId && !i.bundleId).map(i => i.productId);
    const bundleIds = items.filter(i => i.bundleId).map(i => i.bundleId);

    const [productsArray, bundlesArray] = await Promise.all([
      productIds.length > 0
        ? Product.find({ _id: { $in: productIds }, tenantId }).lean()
        : Promise.resolve([]),
      bundleIds.length > 0
        ? ProductBundle.find({ _id: { $in: bundleIds }, tenantId, isActive: true }).lean()
        : Promise.resolve([]),
    ]);

    const productMap = new Map(productsArray.map(p => [p._id.toString(), p]));
    const bundleMap = new Map(bundlesArray.map(b => [b._id.toString(), b]));

    // Also batch-load all products referenced by bundles
    const bundleProductIds = bundlesArray.flatMap(b => b.items.map((bi: any) => bi.productId)); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (bundleProductIds.length > 0) {
      const bundleProducts = await Product.find({ _id: { $in: bundleProductIds }, tenantId }).lean();
      for (const bp of bundleProducts) {
        if (!productMap.has(bp._id.toString())) {
          productMap.set(bp._id.toString(), bp);
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
          const bundleProduct = productMap.get(bundleItem.productId.toString());
          if (!bundleProduct) {
            continue; // Skip if product not found (shouldn't happen, but safety check)
          }

          const trackInventory = bundleProduct.trackInventory !== false; // Default to true if not set
          const allowOutOfStockSales = bundleProduct.allowOutOfStockSales === true;

          if (trackInventory && !allowOutOfStockSales) {
            const availableStock = await getProductStock(
              bundleItem.productId.toString(),
              tenantId,
              {
                branchId: typeof branchId === 'string' ? branchId : undefined,
                variation: bundleItem.variation,
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

      // Atomic check + increment: find the discount and increment usage in one operation.
      // The query filter ensures validity, active status, and usage limit in the same step,
      // preventing race conditions where two transactions pass the check simultaneously.
      const discount = await Discount.findOneAndUpdate(
        {
          tenantId,
          code: typeof discountCode === 'string' ? discountCode.toUpperCase() : '',
          isActive: true,
          validFrom: { $lte: now },
          validUntil: { $gte: now },
          $or: [
            { usageLimit: { $exists: false } },
            { usageLimit: null },
            { usageLimit: 0 },
            { $expr: { $lt: ['$usageCount', '$usageLimit'] } },
          ],
        },
        { $inc: { usageCount: 1 } },
        { new: false } // return pre-increment doc for calculations
      );

      if (!discount) {
        // Lookup without filters to give a specific error message
        const rawDiscount = await Discount.findOne({
          tenantId,
          code: typeof discountCode === 'string' ? discountCode.toUpperCase() : '',
        });

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
        await Discount.findByIdAndUpdate(discount._id, { $inc: { usageCount: -1 } });
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
    }

    // Calculate subtotal after discount
    const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);

    // Calculate tax (if applicable)
    let taxAmount = 0;
    let taxResult: { taxAmount: number; taxRate: number; taxLabel: string; taxableAmount: number; exemptAmount: number } | null = null;
    if (typeof calculateTax === 'function') {
      const taxItems = transactionItems.map((item) => ({
        productId: item.product ? String(item.product) : undefined,
        productType: item.bundleId ? ('bundle' as const) : ('regular' as const),
        categoryId: item.categoryId ? item.categoryId.toString() : undefined,
        taxExempt: item.taxExempt || false,
        subtotal: item.subtotal,
      }));
      taxResult = await calculateTax(tenantId, subtotalAfterDiscount, taxItems, tenantSettings ?? undefined, appliedDiscountCategory);
      taxAmount = taxResult.taxAmount;
    }

    // Calculate total after discount, tax, and loyalty redemption
    const total = Math.max(0, subtotalAfterDiscount + taxAmount - loyaltyDiscountAmount);

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

    if (onAccountAmountToBill > 0.009) {
      const creditCustomer = await Customer.findOne({ _id: customerId, tenantId, isActive: true })
        .select('accountBalance creditLimit')
        .lean();
      if (!creditCustomer) {
        return NextResponse.json(
          { success: false, error: t('validation.customerNotFound', 'Customer not found or inactive') },
          { status: 404 }
        );
      }
      const currentBal = creditCustomer.accountBalance ?? 0;
      const projected = currentBal + onAccountAmountToBill;
      if (
        typeof creditCustomer.creditLimit === 'number' &&
        creditCustomer.creditLimit >= 0 &&
        projected - creditCustomer.creditLimit > 0.01
      ) {
        return NextResponse.json(
          { success: false, error: t('validation.creditLimitExceeded', "Sale would exceed this customer's credit limit") },
          { status: 400 }
        );
      }
    }

    // ─── Atomic section: stock + transaction + payments in a MongoDB session ───
    // If the DB supports replica sets, all writes are atomic.
    // On standalone dev servers, session falls back gracefully.
    const session = await mongoose.startSession();
    let transaction;
    const paymentRecords: Array<{ _id: unknown; method: string; amount: number; status: string }> = [];

    try {
      session.startTransaction();

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
            session
          );
        } else if (productId) {
          const product = await Product.findOne({ _id: productId, tenantId }).session(session);
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
              session
            );
          }
        }
      }

      // Generate receipt number
      const receiptNumber = await generateReceiptNumber(tenantId);

      // Create transaction
      const [txn] = await Transaction.create([{
        tenantId,
        branchId: branchId || undefined,
        items: transactionItems,
        subtotal,
        discountCode: appliedDiscountCode,
        discountCategory: appliedDiscountCategory,
        discountAmount: discountAmount > 0 ? discountAmount : undefined,
        taxExemptAmount: taxResult?.exemptAmount || 0,
        taxAmount: taxAmount > 0 ? taxAmount : undefined,
        total,
        paymentMethod: finalPaymentMethod,
        cashReceived: finalPaymentMethod === 'cash' ? finalCashReceived : undefined,
        change: finalPaymentMethod === 'cash' ? finalChange : undefined,
        status: 'completed',
        customerId: customerId || undefined,
        userId: user.userId,
        receiptNumber,
        notes,
        // Restaurant & split billing
        orderType: orderType || undefined,
        tableNumber: tableNumber || undefined,
        tableId: tableId || undefined,
        splitCount: splitCount || undefined,
        splitPayments: splitPayments || undefined,
      }], { session });
      transaction = txn;

      // Link stock movements to transaction
      for (const item of items) {
        const { productId, bundleId } = item;
        if (productId || bundleId) {
          await StockMovement.updateOne(
            {
              productId: productId || undefined,
              tenantId,
              reason: productId ? 'Transaction sale' : 'Transaction sale - bundle',
              transactionId: { $exists: false },
            },
            { $set: { transactionId: transaction._id } },
            { session }
          );
        }
      }

      // ─── Loyalty: earn and/or redeem points ───
      if (loyaltyEnabled && loyaltyCustomer && loyaltyConfig) {
        const currentBalance = loyaltyCustomer.loyaltyPointsBalance ?? 0;
        let newBalance = currentBalance;

        // Redeem first
        const loyaltyUpdate: Record<string, number> = {};
        if (loyaltyPointsToRedeem > 0) {
          const balanceAfterRedeem = Math.max(0, newBalance - loyaltyPointsToRedeem);
          await LoyaltyTransaction.create([{
            tenantId,
            customerId: loyaltyCustomer._id,
            transactionId: transaction._id,
            type: 'redeem',
            points: -loyaltyPointsToRedeem,
            balanceBefore: newBalance,
            balanceAfter: balanceAfterRedeem,
            description: `Redeemed ${loyaltyPointsToRedeem} points (₱${loyaltyDiscountAmount.toFixed(2)} discount)`,
            createdBy: user.userId,
          }], { session });
          newBalance = balanceAfterRedeem;
          loyaltyUpdate.loyaltyPointsRedeemed = loyaltyPointsToRedeem;
        }

        // Earn points on total paid (after redemption discount)
        const pointsEarned = Math.floor(total * loyaltyConfig.pointsPerPeso);
        if (pointsEarned > 0) {
          const balanceAfterEarn = newBalance + pointsEarned;
          await LoyaltyTransaction.create([{
            tenantId,
            customerId: loyaltyCustomer._id,
            transactionId: transaction._id,
            type: 'earn',
            points: pointsEarned,
            balanceBefore: newBalance,
            balanceAfter: balanceAfterEarn,
            description: `Earned ${pointsEarned} points from receipt #${transaction.receiptNumber}`,
            createdBy: user.userId,
          }], { session });
          newBalance = balanceAfterEarn;
          loyaltyUpdate.loyaltyPointsEarned = pointsEarned;
        }

        // Single update for all loyalty fields
        if (Object.keys(loyaltyUpdate).length > 0) {
          await Transaction.updateOne({ _id: transaction._id }, { $set: loyaltyUpdate }, { session });
        }

        // Persist updated balance on customer
        await Customer.updateOne(
          { _id: loyaltyCustomer._id },
          { $set: { loyaltyPointsBalance: newBalance } },
          { session }
        );
      }

      // Create Payment record(s)
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

            const [paymentRecord] = await Payment.create([{
              tenantId,
              transactionId: transaction._id,
              method: toPaymentRecordMethod(payment.method),
              amount: payment.amount,
              status: 'completed',
              details: Object.keys(paymentDetails).length > 0 ? paymentDetails : undefined,
              processedBy: user.userId,
              processedAt: new Date(),
            }], { session });
            paymentRecords.push(paymentRecord);
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

          const [paymentRecord] = await Payment.create([{
            tenantId,
            transactionId: transaction._id,
            method: toPaymentRecordMethod(finalPaymentMethod),
            amount: total,
            status: 'completed',
            details: Object.keys(paymentDetails).length > 0 ? paymentDetails : undefined,
            processedBy: user.userId,
            processedAt: new Date(),
          }], { session });
          paymentRecords.push(paymentRecord);
        }
      }

      if (onAccountAmountToBill > 0.009 && customerId) {
        await Customer.updateOne(
          { _id: customerId, tenantId },
          { $inc: { accountBalance: onAccountAmountToBill } },
          { session }
        );
      }

      await session.commitTransaction();
    } catch (sessionError) {
      await session.abortTransaction();
      throw sessionError;
    } finally {
      session.endSession();
    }

    // Reset table status to 'open' after dine-in payment completes
    if (tableId && orderType === 'dine-in') {
      try {
        await Table.findOneAndUpdate(
          { _id: tableId, tenantId },
          { status: 'open', currentOrderId: undefined }
        );
      } catch (tableErr) {
        logger.error('Failed to reset table status:', tableErr);
        // Non-critical — don't fail the response
      }
    }

    // Create audit log
    await createAuditLog(request, {
      tenantId,
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
      },
    });

    // Update subscription usage
    try {
      const currentTransactionCount = await Transaction.countDocuments({
        tenantId,
        createdAt: {
          $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1), // Start of current month
          $lt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1) // Start of next month
        }
      });
      await SubscriptionService.updateUsage(tenantId.toString(), {
        transactions: currentTransactionCount
      });
    } catch (usageError) {
      logger.error('Failed to update subscription usage:', usageError);
      // Don't fail the request if usage update fails
    }

    // Include payment records in response if created
    const responseData = transaction.toObject ? transaction.toObject() : transaction;
    if (paymentRecords.length > 0) {
      (responseData as unknown as Record<string, unknown>).payments = paymentRecords.map((p: { _id: unknown; method: string; amount: number; status: string }) => ({
        _id: p._id,
        method: p.method,
        amount: p.amount,
        status: p.status,
      }));
    }

    return NextResponse.json({ success: true, data: responseData }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Transaction failed';
    // Business validation errors (stock, discount, payment) are 400; unexpected errors are 500
    const businessErrors = ['Insufficient stock', 'Invalid', 'not found', 'not enabled', 'limit', 'required', 'Unauthorized', 'Forbidden'];
    const isBusinessError = businessErrors.some(e => message.toLowerCase().includes(e.toLowerCase()));
    logger.error('Transaction POST error:', error);
    return NextResponse.json({ success: false, error: message }, { status: isBusinessError ? 400 : 500 });
  }
}

