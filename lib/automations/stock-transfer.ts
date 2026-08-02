/**
 * Automated Stock Transfer Between Branches
 * Automatically transfer stock from well-stocked branches to low-stock branches
 */

import prisma from '@/lib/prisma';
import { updateStock } from '@/lib/stock';
import { sendEmail } from '@/lib/notifications';
import { getTenantSettingsById } from '@/lib/tenant';
import { AutomationResult } from './types';

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

    // Get tenants to process
    let tenants;
    if (options.tenantId) {
      const tenant = await prisma.tenant.findUnique({ where: { id: options.tenantId } });
      tenants = tenant ? [tenant] : [];
    } else {
      tenants = await prisma.tenant.findMany({ where: { isActive: true } });
    }

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalTransfers = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant.id;
        const tenantSettings = await getTenantSettingsById(tenantId);

        // Get all branches for this tenant
        const branches = await prisma.branch.findMany({ where: { tenantId, isActive: true } });

        if (branches.length < 2) {
          continue; // Need at least 2 branches for transfers
        }

        // Get all products with branch stock records
        const products = await prisma.product.findMany({
          where: { tenantId, trackInventory: true },
          include: { branchStock: true },
        });

        for (const product of products) {
          try {
            if (!product.branchStock || product.branchStock.length < 2) {
              continue;
            }

            // Find branches with low stock and high stock
            const branchStocks = product.branchStock.map((bs) => ({
              branchId: bs.branchId,
              stock: bs.stock || 0,
            }));

            // Sort by stock level
            branchStocks.sort((a, b) => a.stock - b.stock);

            const lowStockBranches = branchStocks.filter(bs => bs.stock <= minStockThreshold);
            const highStockBranches = branchStocks.filter(bs => bs.stock > minStockThreshold * 3);

            if (lowStockBranches.length === 0 || highStockBranches.length === 0) {
              continue; // No imbalance
            }

            // Create transfer requests
            for (const lowStock of lowStockBranches.slice(0, 2)) { // Limit to 2 transfers per product
              const highStock = highStockBranches[highStockBranches.length - 1]; // Use highest stock branch

              const transferQuantity = Math.min(
                Math.ceil((minStockThreshold * 2 - lowStock.stock) / 2), // Transfer enough to bring to 2x threshold
                Math.floor(highStock.stock / 2) // Don't take more than half from source
              );

              if (transferQuantity <= 0) {
                continue;
              }

              // Get branch names
              const fromBranch = branches.find(b => b.id === highStock.branchId);
              const toBranch = branches.find(b => b.id === lowStock.branchId);

              if (!fromBranch || !toBranch) {
                continue;
              }

              if (autoApprove) {
                // Auto-transfer: decrement source branch stock, increment destination branch stock,
                // and record stock movements via lib/stock.ts's updateStock (branch-scoped).
                await updateStock(
                  product.id,
                  tenantId,
                  -transferQuantity,
                  'transfer',
                  { branchId: fromBranch.id, reason: `Auto-transfer to ${toBranch.name}` }
                );

                await updateStock(
                  product.id,
                  tenantId,
                  transferQuantity,
                  'transfer',
                  { branchId: toBranch.id, reason: `Auto-transfer from ${fromBranch.name}` }
                );
              } else {
                // Create transfer request (notification only for now)
                // In production, you might want a dedicated TransferRequest model
                if (tenantSettings?.emailNotifications && tenantSettings?.email) {
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
              }

              totalTransfers++;
            }
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            totalFailed++;
            results.errors?.push(`Product ${product.id}: ${error.message}`);
          }
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
