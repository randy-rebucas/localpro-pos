/**
 * Automated Purchase Order Generation
 * Automatically generate purchase orders when stock hits reorder point
 */

import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import Tenant from '@/models/Tenant';
import { getLowStockProducts } from '@/lib/stock';
import { sendEmail } from '@/lib/notifications';
import { getTenantSettingsById } from '@/lib/tenant';
import { AutomationResult } from './types';

export interface PurchaseOrderOptions {
  tenantId?: string;
  generateDocuments?: boolean; // Generate PDF/CSV documents
  sendToSuppliers?: boolean; // Send to suppliers via email
}

/**
 * Generate purchase orders for products below reorder point
 */
export async function generatePurchaseOrders(
  options: PurchaseOrderOptions = {}
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
    // Get tenants to process
    let tenants;
    if (options.tenantId) {
      const tenant = await Tenant.findById(options.tenantId).lean();
      tenants = tenant ? [tenant] : [];
    } else {
      tenants = await Tenant.find({ status: 'active' }).lean();
    }

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalOrders = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id.toString();
        const tenantSettings = await getTenantSettingsById(tenantId);

        // Get products that need reordering
        // For now, we'll use low stock products as a proxy
        // In production, you'd check reorderPoint field on Product
        const lowStockProducts = await getLowStockProducts(tenantId);

        // Group products that need reordering
        const productsToReorder = lowStockProducts.filter((product: any) => {
          // Check if product has reorderPoint set (if field exists)
          // For now, we'll use products below threshold
          return product.currentStock <= (product.threshold || 10);
        });

        if (productsToReorder.length === 0) {
          continue;
        }

        // Generate purchase order data
        const purchaseOrderItems = productsToReorder.map((product: any) => {
          // Calculate reorder quantity (if reorderQuantity field exists, use it; otherwise suggest threshold * 2)
          const reorderQuantity = product.reorderQuantity || ((product.threshold || 10) * 2);
          
          return {
            productId: product._id,
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
          
          const emailBody = `Purchase Order Generated for ${companyName}

Order Number: ${orderNumber}
Date: ${orderDate.toLocaleDateString()}

The following products need to be reordered:

${purchaseOrderItems.map(item => 
  `- ${item.name} (SKU: ${item.sku})
  Current Stock: ${item.currentStock}
  Reorder Quantity: ${item.reorderQuantity}
  Unit Price: $${item.unitPrice.toFixed(2)}
  Subtotal: $${item.subtotal.toFixed(2)}`
).join('\n\n')}

Total Amount: $${totalAmount.toFixed(2)}

Please review and approve this purchase order.

CSV Data:
${csvContent}

This is an automated purchase order from your POS system.`;

          await sendEmail({
            to: tenantSettings.email,
            subject: `Purchase Order Generated: ${orderNumber} - ${companyName}`,
            message: emailBody,
            type: 'email',
          }).catch(() => {
            // Don't fail if email fails
          });

          totalOrders++;
        }
      } catch (error: any) {
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalOrders;
    results.failed = totalFailed;
    results.message = `Generated ${totalOrders} purchase orders${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) {
    results.success = false;
    results.message = `Error generating purchase orders: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
