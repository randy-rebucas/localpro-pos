/**
 * Automated Stock Transfer Between Branches
 * Automatically transfer stock from well-stocked branches to low-stock branches.
 *
 * Every imbalance found is recorded as a real StockTransfer row (the same model
 * the admin UI at /admin/stock-transfers reads and writes), so both automated and
 * manual transfers share one auditable source of truth — nothing here mutates
 * ProductBranchStock without a StockTransfer record backing it.
 */

import { randomUUID } from 'crypto';
import prisma, { dbTransaction } from '@/lib/db';
import { sendEmail } from '@/lib/notifications';
import { getTenantSettingsById } from '@/lib/tenant';
import { AutomationResult } from './types';

export interface StockTransferOptions {
  tenantId?: string;
  autoApprove?: boolean; // Auto-send and auto-receive the transfer (default: false - stays pending for manual review)
  minStockThreshold?: number; // Minimum stock to trigger transfer (default: 5)
}

async function getNextStockTransferNumber(tenantId: string): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const prefix = `ST-${dateStr}`;

  const counter = await dbTransaction(async (tx) => {
    return tx.counter.upsert({
      where: { tenantId_key: { tenantId, key: prefix } },
      update: { value: { increment: 1 } },
      create: { id: randomUUID(), tenantId, key: prefix, value: 1 },
    });
  });

  return `${prefix}-${counter.value.toString().padStart(4, '0')}`;
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

        // Get all products with branch stock
        const products = await prisma.product.findMany({
          where: {
            tenantId,
            trackInventory: true,
            branchStock: { some: {} },
          },
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

              const transferNumber = await getNextStockTransferNumber(tenantId);
              const itemId = randomUUID();

              if (autoApprove) {
                // Auto-send and auto-receive: create the transfer already completed, with a full
                // StockMovement trail on both sides (same shape the manual send/receive routes write).
                await dbTransaction(async (tx) => {
                  const fromStockBefore = highStock.stock;
                  const fromStockAfter = fromStockBefore - transferQuantity;

                  await tx.productBranchStock.updateMany({
                    where: { productId: product.id, branchId: highStock.branchId },
                    data: { stock: { decrement: transferQuantity } },
                  });

                  const existingToStock = await tx.productBranchStock.findUnique({
                    where: { productId_branchId: { productId: product.id, branchId: lowStock.branchId } },
                  });

                  const toStockBefore = existingToStock?.stock ?? 0;
                  const toStockAfter = toStockBefore + transferQuantity;

                  if (existingToStock) {
                    await tx.productBranchStock.update({
                      where: { id: existingToStock.id },
                      data: { stock: { increment: transferQuantity } },
                    });
                  } else {
                    await tx.productBranchStock.create({
                      data: {
                        id: randomUUID(),
                        productId: product.id,
                        branchId: lowStock.branchId,
                        stock: transferQuantity,
                      },
                    });
                  }

                  await tx.stockMovement.create({
                    data: {
                      id: randomUUID(),
                      productId: product.id,
                      tenantId,
                      branchId: fromBranch.id,
                      quantity: -transferQuantity,
                      previousStock: fromStockBefore,
                      newStock: fromStockAfter,
                      reason: `Auto-transfer ${transferNumber} to ${toBranch.name}`,
                      type: 'transfer',
                    },
                  });

                  await tx.stockMovement.create({
                    data: {
                      id: randomUUID(),
                      productId: product.id,
                      tenantId,
                      branchId: toBranch.id,
                      quantity: transferQuantity,
                      previousStock: toStockBefore,
                      newStock: toStockAfter,
                      reason: `Auto-transfer ${transferNumber} from ${fromBranch.name}`,
                      type: 'transfer',
                    },
                  });

                  const now = new Date();
                  await tx.stockTransfer.create({
                    data: {
                      id: randomUUID(),
                      tenantId,
                      fromBranchId: fromBranch.id,
                      toBranchId: toBranch.id,
                      transferNumber,
                      status: 'received',
                      notes: 'Auto-generated by low-stock rebalancing automation',
                      sentAt: now,
                      receivedAt: now,
                      items: {
                        create: {
                          id: itemId,
                          productId: product.id,
                          quantityRequested: transferQuantity,
                          quantitySent: transferQuantity,
                          quantityReceived: transferQuantity,
                        },
                      },
                    },
                  });
                });
              } else {
                // Create a pending transfer for manual review/approval in /admin/stock-transfers —
                // no stock moves until someone sends and receives it there.
                await prisma.stockTransfer.create({
                  data: {
                    id: randomUUID(),
                    tenantId,
                    fromBranchId: fromBranch.id,
                    toBranchId: toBranch.id,
                    transferNumber,
                    status: 'pending',
                    notes: 'Auto-generated by low-stock rebalancing automation — pending approval',
                    items: {
                      create: {
                        id: itemId,
                        productId: product.id,
                        quantityRequested: transferQuantity,
                      },
                    },
                  },
                });

                if (tenantSettings?.emailNotifications && tenantSettings?.email) {
                  const companyName = tenantSettings?.companyName || tenant.name || 'Business';

                  await sendEmail({
                    to: tenantSettings.email,
                    subject: `Stock Transfer Request: ${product.name}`,
                    message: `Stock Transfer Request for ${companyName}

Transfer: ${transferNumber}
Product: ${product.name}${product.sku ? ` (SKU: ${product.sku})` : ''}

From: ${fromBranch.name}
Current Stock: ${highStock.stock}
Transfer Quantity: ${transferQuantity}

To: ${toBranch.name}
Current Stock: ${lowStock.stock}
After Transfer: ${lowStock.stock + transferQuantity}

Review and approve this transfer in Admin → Stock Transfers.

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
