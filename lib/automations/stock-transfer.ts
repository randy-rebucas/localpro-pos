/**
 * Automated Stock Transfer Between Branches
 * Automatically transfer stock from well-stocked branches to low-stock branches
 */

import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import Branch from '@/models/Branch';
import StockMovement from '@/models/StockMovement';
import { sendEmail } from '@/lib/notifications';
import { getAutomationTenants } from './tenants';
import { AutomationResult } from './types';
import mongoose from 'mongoose';

export interface StockTransferOptions {
  tenantId?: string;
  autoApprove?: boolean; // Auto-approve transfers (default: false - requires approval)
  minStockThreshold?: number; // Minimum stock to trigger transfer (default: 5)
}

/**
 * Detect stock imbalances and create transfer requests
 */
export async function detectStockImbalances(
  options: StockTransferOptions = {}
): Promise<AutomationResult> {
  await connectDB();

  const results: AutomationResult = {
    success: true,
    message: '',
    processed: 0,
    failed: 0,
    errors: [],
  };

  try {
    const minStockThreshold = options.minStockThreshold || 5;
    const autoApprove = options.autoApprove || false;

    // Get tenants to process. Without auto-approve, transfer requests are only
    // delivered by email, so tenants without email notifications are filtered out.
    const tenants = await getAutomationTenants({
      tenantId: options.tenantId,
      filter: {
        'settings.enableInventory': { $ne: false },
        ...(autoApprove ? {} : {
          'settings.emailNotifications': true,
          'settings.email': { $nin: [null, ''] },
        }),
      },
    });

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalTransfers = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id;
        const tenantSettings = tenant.settings;

        // Manual single-tenant runs bypass the filter; requests need an email to go to
        if (!autoApprove && (!tenantSettings?.emailNotifications || !tenantSettings?.email)) {
          continue;
        }

        // Get all branches for this tenant
        const branches = await Branch.find({ tenantId, isActive: true }).select('name').lean();

        if (branches.length < 2) {
          continue; // Need at least 2 branches for transfers
        }

        // Get all products stocked in at least 2 branches
        const products = await Product.find({
          tenantId,
          trackInventory: true,
          'branchStock.1': { $exists: true },
        })
          .select('name sku branchStock')
          .lean();

        // Auto-approve writes are collected and applied once per tenant
        const stockUpdates: mongoose.AnyBulkWriteOperation[] = [];
        const movements: Record<string, unknown>[] = [];

        for (const product of products) {
          try {
            if (!product.branchStock || product.branchStock.length < 2) {
              continue;
            }

            // Find branches with low stock and high stock
            const branchStocks = product.branchStock.map((bs: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
              branchId: bs.branchId.toString(),
              stock: bs.stock || 0,
            }));

            // Sort by stock level
            branchStocks.sort((a, b) => a.stock - b.stock);

            const lowStockBranches = branchStocks.filter(bs => bs.stock <= minStockThreshold);
            const highStockBranches = branchStocks.filter(bs => bs.stock > minStockThreshold * 3);

            if (lowStockBranches.length === 0 || highStockBranches.length === 0) {
              continue; // No imbalance
            }

            const highStock = highStockBranches[highStockBranches.length - 1]; // Use highest stock branch
            // Running source stock for the movement records (both transfers may draw from it)
            let sourceStock = highStock.stock;

            // Create transfer requests
            for (const lowStock of lowStockBranches.slice(0, 2)) { // Limit to 2 transfers per product
              const transferQuantity = Math.min(
                Math.ceil((minStockThreshold * 2 - lowStock.stock) / 2), // Transfer enough to bring to 2x threshold
                Math.floor(highStock.stock / 2) // Don't take more than half from source
              );

              if (transferQuantity <= 0) {
                continue;
              }

              // Get branch names
              const fromBranch = branches.find(b => b._id.toString() === highStock.branchId);
              const toBranch = branches.find(b => b._id.toString() === lowStock.branchId);

              if (!fromBranch || !toBranch) {
                continue;
              }

              if (autoApprove) {
                // Auto-transfer: atomic $inc on both branch entries (the destination entry
                // always exists, since low-stock branches come from the product's branchStock)
                stockUpdates.push({
                  updateOne: {
                    filter: { _id: product._id, tenantId },
                    update: {
                      $inc: {
                        'branchStock.$[from].stock': -transferQuantity,
                        'branchStock.$[to].stock': transferQuantity,
                      },
                    },
                    arrayFilters: [
                      { 'from.branchId': fromBranch._id },
                      { 'to.branchId': toBranch._id },
                    ],
                  },
                });

                // Create stock movement records
                movements.push({
                  productId: product._id,
                  tenantId,
                  branchId: fromBranch._id,
                  type: 'transfer',
                  quantity: -transferQuantity,
                  previousStock: sourceStock,
                  newStock: sourceStock - transferQuantity,
                  reason: `Auto-transfer to ${toBranch.name}`,
                });
                movements.push({
                  productId: product._id,
                  tenantId,
                  branchId: toBranch._id,
                  type: 'transfer',
                  quantity: transferQuantity,
                  previousStock: lowStock.stock,
                  newStock: lowStock.stock + transferQuantity,
                  reason: `Auto-transfer from ${fromBranch.name}`,
                });
                sourceStock -= transferQuantity;
              } else if (tenantSettings?.email) {
                // Create transfer request (notification only for now)
                // In production, you might want a TransferRequest model
                const companyName = tenantSettings?.companyName || tenant.name || 'Business';

                await sendEmail({
                  to: tenantSettings.email,
                  subject: `Stock Transfer Request: ${product.name}`,
                  message: `Stock Transfer Request for ${companyName}

Product: ${product.name}${product.sku ? ` (SKU: ${product.sku})` : ''}

From: ${fromBranch.name}
Current Stock: ${highStock.stock}
Transfer Quantity: ${transferQuantity}

To: ${toBranch.name}
Current Stock: ${lowStock.stock}
After Transfer: ${lowStock.stock + transferQuantity}

Please review and approve this transfer request.

This is an automated stock transfer request from your POS system.`,
                  type: 'email',
                }).catch(() => {
                  // Don't fail if email fails
                });
              }

              totalTransfers++;
            }
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            totalFailed++;
            results.errors?.push(`Product ${product._id}: ${error.message}`);
          }
        }

        if (stockUpdates.length > 0) {
          await Product.bulkWrite(stockUpdates, { ordered: true });
          await StockMovement.insertMany(movements);
        }
      } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalTransfers;
    results.failed = totalFailed;
    results.message = `${autoApprove ? 'Processed' : 'Created'} ${totalTransfers} stock transfers${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    results.success = false;
    results.message = `Error detecting stock imbalances: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
