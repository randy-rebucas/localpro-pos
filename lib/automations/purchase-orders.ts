/**
 * Automated Purchase Order Generation
 * Automatically generate purchase orders when stock hits reorder point.
 *
 * Products with a `preferredSupplierId` set get a real draft PurchaseOrder row
 * created (the same model /admin/purchase-orders reads and writes), grouped by
 * supplier, so the automation and manual ordering share one source of truth.
 * Products with no preferred supplier fall back to the original CSV-in-email
 * behavior, since a PurchaseOrder can't be created without a supplier.
 */

import { randomUUID } from 'crypto';
import prisma, { dbTransaction } from '@/lib/db';
import { getLowStockProducts } from '@/lib/stock';
import { sendEmail } from '@/lib/notifications';
import { getTenantSettingsById } from '@/lib/tenant';
import { getCurrencySymbol } from '@/lib/currency';
import { AutomationResult } from './types';

export interface PurchaseOrderOptions {
  tenantId?: string;
  generateDocuments?: boolean; // Generate PDF/CSV documents
  sendToSuppliers?: boolean; // Send to suppliers via email
}

async function getNextPurchaseOrderNumber(tenantId: string): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const prefix = `PO-${dateStr}`;

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
 * Generate purchase orders for products below reorder point
 */
export async function generatePurchaseOrders(
  options: PurchaseOrderOptions = {}
): Promise<AutomationResult> {
  const results: AutomationResult = {
    success: true,
    message: '',
    processed: 0,
    failed: 0,
    errors: [],
  };

  try {
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

    let totalOrders = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant.id;
        const tenantSettings = await getTenantSettingsById(tenantId);

        // Get products that need reordering
        // For now, we'll use low stock products as a proxy
        // In production, you'd check reorderPoint field on Product
        const lowStockProducts = await getLowStockProducts(tenantId);

        // Group products that need reordering
        const productsToReorder = lowStockProducts.filter((product: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          // Check if product has reorderPoint set (if field exists)
          // For now, we'll use products below threshold
          return product.currentStock <= (product.threshold || 10);
        });

        if (productsToReorder.length === 0) {
          continue;
        }

        // Split into products with a preferred supplier (get a real draft PurchaseOrder each)
        // vs. products with none (fall back to the emailed CSV, since PurchaseOrder.supplierId is required).
        const bySupplier = new Map<string, typeof productsToReorder>();
        const withoutSupplier: typeof productsToReorder = [];

        for (const product of productsToReorder) {
          if (product.preferredSupplierId) {
            const group = bySupplier.get(product.preferredSupplierId) || [];
            group.push(product);
            bySupplier.set(product.preferredSupplierId, group);
          } else {
            withoutSupplier.push(product);
          }
        }

        for (const [supplierId, products] of bySupplier) {
          try {
            const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, tenantId, isActive: true } });
            if (!supplier) continue; // Preferred supplier was deleted/deactivated — skip rather than guess.

            const orderNumber = await getNextPurchaseOrderNumber(tenantId);
            const items = products.map((product: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
              const reorderQuantity = product.reorderQuantity || ((product.threshold || 10) * 2);
              const unitCost = Number(product.price) || 0;
              return {
                id: randomUUID(),
                productId: product._id ?? product.id,
                quantityOrdered: reorderQuantity,
                unitCost,
                subtotal: unitCost * reorderQuantity,
              };
            });
            const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);

            await prisma.purchaseOrder.create({
              data: {
                id: randomUUID(),
                tenantId,
                supplierId,
                orderNumber,
                notes: 'Auto-generated by low-stock reorder automation — review before marking as ordered',
                totalAmount,
                items: { create: items },
              },
            });

            if (tenantSettings?.emailNotifications && tenantSettings?.email) {
              const companyName = tenantSettings?.companyName || tenant.name || 'Business';
              const currencySymbol = tenantSettings.currencySymbol || getCurrencySymbol(tenantSettings.currency || 'PHP');
              await sendEmail({
                to: tenantSettings.email,
                subject: `Draft Purchase Order Created: ${orderNumber} - ${companyName}`,
                message: `A draft purchase order was auto-generated for ${supplier.name}.

Order Number: ${orderNumber}
Items: ${products.length}
Total: ${currencySymbol}${totalAmount.toFixed(2)}

Review and approve it in Admin → Purchase Orders before it's sent to the supplier.

This is an automated purchase order from your POS system.`,
                type: 'email',
              }).catch(() => {
                // Don't fail if email fails
              });
            }

            totalOrders++;
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            totalFailed++;
            results.errors?.push(`Tenant ${tenant.name} / supplier ${supplierId}: ${error.message}`);
          }
        }

        if (withoutSupplier.length === 0) {
          continue;
        }

        // Generate purchase order data
        const purchaseOrderItems = withoutSupplier.map((product: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          // Calculate reorder quantity (if reorderQuantity field exists, use it; otherwise suggest threshold * 2)
          const reorderQuantity = product.reorderQuantity || ((product.threshold || 10) * 2);

          return {
            productId: product._id ?? product.id,
            name: product.name,
            sku: product.sku || 'N/A',
            currentStock: product.currentStock || 0,
            reorderQuantity,
            unitPrice: product.price || 0,
            subtotal: (product.price || 0) * reorderQuantity,
          };
        });

        const totalAmount = purchaseOrderItems.reduce((sum, item) => sum + item.subtotal, 0);
        const orderDate = new Date();
        const orderNumber = `PO-${orderDate.toISOString().split('T')[0].replace(/-/g, '')}-${Date.now().toString().slice(-6)}`;

        // Generate purchase order document (CSV format for now)
        const csvContent = [
          ['Purchase Order', orderNumber],
          ['Date', orderDate.toLocaleDateString()],
          ['Tenant', tenant.name],
          [],
          ['Product Name', 'SKU', 'Current Stock', 'Reorder Quantity', 'Unit Price', 'Subtotal'],
          ...purchaseOrderItems.map(item => [
            item.name,
            item.sku,
            item.currentStock.toString(),
            item.reorderQuantity.toString(),
            item.unitPrice.toFixed(2),
            item.subtotal.toFixed(2),
          ]),
          [],
          ['Total Amount', totalAmount.toFixed(2)],
        ].map(row => row.join(',')).join('\n');

        // Send to tenant email for approval
        if (tenantSettings?.emailNotifications && tenantSettings?.email) {
          const companyName = tenantSettings?.companyName || tenant.name || 'Business';
          const currencySymbol = tenantSettings.currencySymbol || getCurrencySymbol(tenantSettings.currency || 'PHP');

          const emailBody = `Purchase Order Suggestion for ${companyName}

Order Reference: ${orderNumber}
Date: ${orderDate.toLocaleDateString()}

The following products need to be reordered but have no preferred supplier set,
so no draft purchase order could be created automatically. Assign a preferred
supplier on each product (Admin → Products) to have future suggestions turn
into a real draft order in Admin → Purchase Orders.

${purchaseOrderItems.map(item =>
  `- ${item.name} (SKU: ${item.sku})
  Current Stock: ${item.currentStock}
  Reorder Quantity: ${item.reorderQuantity}
  Unit Price: ${currencySymbol}${item.unitPrice.toFixed(2)}
  Subtotal: ${currencySymbol}${item.subtotal.toFixed(2)}`
).join('\n\n')}

Total Amount: ${currencySymbol}${totalAmount.toFixed(2)}

CSV Data:
${csvContent}

This is an automated suggestion from your POS system.`;

          await sendEmail({
            to: tenantSettings.email,
            subject: `Reorder Suggestion (no supplier set): ${orderNumber} - ${companyName}`,
            message: emailBody,
            type: 'email',
          }).catch(() => {
            // Don't fail if email fails
          });

          totalOrders++;
        }
      } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalOrders;
    results.failed = totalFailed;
    results.message = `Generated ${totalOrders} purchase orders${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    results.success = false;
    results.message = `Error generating purchase orders: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
