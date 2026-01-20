import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import Product from '@/models/Product';
import Discount from '@/models/Discount';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { validateAndSanitize, validateTransaction } from '@/lib/validation';
import { generateReceiptNumber } from '@/lib/receipt';
import { updateStock, updateBundleStock, getProductStock } from '@/lib/stock';
import ProductBundle from '@/models/ProductBundle';
import StockMovement from '@/models/StockMovement';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { getTenantSettingsById } from '@/lib/tenant';
import { SubscriptionService } from '@/lib/subscription';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const tenantId = await getTenantIdFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }
    
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50');
    const page = parseInt(searchParams.get('page') || '1');
    const skip = (page - 1) * limit;

    const transactions = await Transaction.find({ tenantId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate('items.product', 'name')
      .lean();

    const total = await Transaction.countDocuments({ tenantId });

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
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
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

    const { items, paymentMethod, cashReceived, notes, discountCode, branchId } = data;

    // Get tenant settings to check feature flags
    const tenantSettings = await getTenantSettingsById(tenantId);

    // Check if discounts are enabled
    if (discountCode && tenantSettings && tenantSettings.enableDiscounts === false) {
      return NextResponse.json(
        { success: false, error: t('validation.discountsNotEnabled', 'Discounts are not enabled for this tenant') },
        { status: 400 }
      );
    }

    // Validate and process items
    const transactionItems = [];
    let subtotal = 0;

    for (const item of items) {
      const { productId, quantity, variation, bundleId } = item;

      // Handle bundles
      if (bundleId) {
        const bundle = await ProductBundle.findOne({ _id: bundleId, tenantId, isActive: true });
        if (!bundle) {
          return NextResponse.json({ success: false, error: t('validation.bundleNotFound', 'Bundle {bundleId} not found').replace('{bundleId}', bundleId) }, { status: 404 });
        }

        // Check stock for all bundle items - but respect allowOutOfStockSales and trackInventory
        for (const bundleItem of bundle.items) {
          const bundleProduct = await Product.findOne({ _id: bundleItem.productId, tenantId });
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
                branchId,
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
        const product = await Product.findOne({ _id: productId, tenantId });
        if (!product) {
          const errorMsg = t('validation.productNotFoundInTransaction', 'Product {productId} not found').replace('{productId}', productId);
          return NextResponse.json({ success: false, error: errorMsg }, { status: 404 });
        }

        // Check stock (considering variations and branches) - but respect allowOutOfStockSales and trackInventory
        const trackInventory = product.trackInventory !== false; // Default to true if not set
        const allowOutOfStockSales = product.allowOutOfStockSales === true;
        
        if (trackInventory && !allowOutOfStockSales) {
          const availableStock = await getProductStock(productId, tenantId, {
            branchId,
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
          const variationData = product.variations.find((v) => {
            const matchSize = !variation.size || v.size === variation.size;
            const matchColor = !variation.color || v.color === variation.color;
            const matchType = !variation.type || v.type === variation.type;
            return matchSize && matchColor && matchType;
          });
          if (variationData && variationData.price) {
            itemPrice = variationData.price;
          }
        }

        const itemSubtotal = itemPrice * quantity;
        subtotal += itemSubtotal;

        transactionItems.push({
          product: product._id,
          name: product.name,
          price: itemPrice,
          quantity: quantity,
          subtotal: itemSubtotal,
          variation: variation,
        });
      }
    }

    // Apply discount if provided
    let discountAmount = 0;
    let appliedDiscountCode: string | undefined;
    
    if (discountCode) {
      const discount = await Discount.findOne({
        tenantId,
        code: discountCode.toUpperCase(),
        isActive: true,
      });

      if (!discount) {
        return NextResponse.json(
          { success: false, error: t('validation.invalidDiscountCode', 'Invalid or inactive discount code') },
          { status: 400 }
        );
      }

      // Check validity dates
      const now = new Date();
      if (now < discount.validFrom || now > discount.validUntil) {
        return NextResponse.json(
          { success: false, error: t('validation.discountCodeNotValid', 'Discount code is not valid at this time') },
          { status: 400 }
        );
      }

      // Check usage limit
      if (discount.usageLimit && discount.usageCount >= discount.usageLimit) {
        return NextResponse.json(
          { success: false, error: t('validation.discountCodeUsageLimit', 'Discount code has reached its usage limit') },
          { status: 400 }
        );
      }

      // Check minimum purchase amount
      if (discount.minPurchaseAmount && subtotal < discount.minPurchaseAmount) {
        const errorMsg = t('validation.minimumPurchaseAmount', 'Minimum purchase amount of {amount} required').replace('{amount}', discount.minPurchaseAmount.toString());
        return NextResponse.json(
          { 
            success: false, 
            error: errorMsg
          },
          { status: 400 }
        );
      }

      // Calculate discount amount
      if (discount.type === 'percentage') {
        discountAmount = (subtotal * discount.value) / 100;
        if (discount.maxDiscountAmount) {
          discountAmount = Math.min(discountAmount, discount.maxDiscountAmount);
        }
      } else {
        discountAmount = Math.min(discount.value, subtotal);
      }

      appliedDiscountCode = discount.code;

      // Increment usage count
      discount.usageCount += 1;
      await discount.save();
    }

    // Calculate final total
    const total = Math.max(0, subtotal - discountAmount);

    // Calculate change for cash payments
    let change = 0;
    if (paymentMethod === 'cash' && cashReceived) {
      change = cashReceived - total;
      if (change < 0) {
        return NextResponse.json({ success: false, error: t('validation.insufficientCashReceived', 'Insufficient cash received') }, { status: 400 });
      }
    }

    // Update stock BEFORE creating transaction (critical - must succeed)
    // Use the original items array to get productId and quantity
    for (const item of items) {
      const { productId, quantity, variation, bundleId } = item;

      // Skip if no productId (shouldn't happen, but safety check)
      if (!productId && !bundleId) {
        console.warn('Skipping stock update: missing productId and bundleId', item);
        continue;
      }

      try {
        if (bundleId) {
          // Update stock for all items in bundle
          await updateBundleStock(
            bundleId,
            tenantId,
            -quantity, // Negative for sale
            'sale',
            {
              userId: user.userId,
              branchId,
              reason: 'Transaction sale - bundle',
            }
          );
        } else if (productId) {
          // Check if product tracks inventory before updating stock
          const product = await Product.findOne({ _id: productId, tenantId });
          if (product && product.trackInventory !== false) {
            // Update stock for regular product (only if tracking inventory)
            await updateStock(
              productId,
              tenantId,
              -quantity, // Negative for sale
              'sale',
              {
                userId: user.userId,
                branchId,
                variation,
                reason: 'Transaction sale',
              }
            );
          }
        }
      } catch (error: any) {
        // Stock update is critical - fail the entire transaction
        console.error(`CRITICAL: Error updating stock for item ${productId || bundleId}:`, error.message || error);
        console.error('Full error:', error);
        throw new Error(`Failed to update stock for ${productId || bundleId}: ${error.message || error}`);
      }
    }

    // Generate receipt number
    const receiptNumber = await generateReceiptNumber(tenantId);

    // Create transaction after stock is successfully updated
    const transaction = await Transaction.create({
      tenantId,
      items: transactionItems,
      subtotal,
      discountCode: appliedDiscountCode,
      discountAmount: discountAmount > 0 ? discountAmount : undefined,
      total,
      paymentMethod,
      cashReceived: paymentMethod === 'cash' ? cashReceived : undefined,
      change: paymentMethod === 'cash' ? change : undefined,
      status: 'completed',
      userId: user.userId,
      receiptNumber,
      notes,
    });

    // Update stock movements with transaction ID (now that transaction exists)
    for (const item of items) {
      const { productId, bundleId } = item;
      if (productId || bundleId) {
        // Update the stock movement records with transaction ID
        await StockMovement.updateOne(
          {
            productId: productId || undefined,
            tenantId,
            reason: productId ? 'Transaction sale' : 'Transaction sale - bundle',
            transactionId: { $exists: false }, // Only update if no transaction ID yet
          },
          {
            $set: { transactionId: transaction._id },
          }
        );
      }
    }

    // Create audit log
    await createAuditLog(request, {
      tenantId,
      action: AuditActions.TRANSACTION_CREATE,
      entityType: 'transaction',
      entityId: transaction._id.toString(),
      changes: {
        receiptNumber,
        total,
        itemsCount: transactionItems.length,
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
      console.error('Failed to update subscription usage:', usageError);
      // Don't fail the request if usage update fails
    }

    return NextResponse.json({ success: true, data: transaction }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

