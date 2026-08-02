/**
 * Customer Lifetime Value Calculation
 * Automatically calculate and update customer lifetime value
 */

import prisma from '@/lib/prisma';
import { AutomationResult } from './types';

export interface CustomerLifetimeValueOptions {
  tenantId?: string;
  updateCustomers?: boolean; // Update customer records with CLV (default: true)
}

/**
 * Calculate and update customer lifetime value
 */
export async function calculateCustomerLifetimeValue(
  options: CustomerLifetimeValueOptions = {}
): Promise<AutomationResult> {
  const results: AutomationResult = {
    success: true,
    message: '',
    processed: 0,
    failed: 0,
    errors: [],
  };

  try {
    const updateCustomers = options.updateCustomers !== false;

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

    let totalUpdated = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant.id;

        // Get all customers
        const customers = await prisma.customer.findMany({ where: { tenantId } });

        for (const customer of customers) {
          try {
            // Calculate total spent from completed transactions linked to this customer
            const agg = await prisma.transaction.aggregate({
              where: {
                tenantId,
                status: 'completed',
                customerId: customer.id,
              },
              _sum: { total: true },
              _count: { _all: true },
              _min: { createdAt: true },
              _max: { createdAt: true },
            });

            const totalSpent = Number(agg._sum.total || 0);
            const transactionCount = agg._count._all;
            const firstPurchase = agg._min.createdAt;
            const lastPurchase = agg._max.createdAt;

            // Calculate average order value
            const avgOrderValue = transactionCount > 0 // eslint-disable-line @typescript-eslint/no-unused-vars
              ? totalSpent / transactionCount
              : 0;

            // Calculate purchase frequency (transactions per month)
            const monthsActive = firstPurchase
              ? Math.max(1, (Date.now() - firstPurchase.getTime()) / (1000 * 60 * 60 * 24 * 30))
              : 1;
            const purchaseFrequency = transactionCount / monthsActive; // eslint-disable-line @typescript-eslint/no-unused-vars

            // Simple CLV calculation: totalSpent (can be enhanced with predictive models)
            const clv = totalSpent; // eslint-disable-line @typescript-eslint/no-unused-vars

            if (updateCustomers) {
              // Update customer record
              await prisma.customer.update({
                where: { id: customer.id },
                data: {
                  totalSpent,
                  lastPurchaseDate: lastPurchase ?? undefined,
                  notes: customer.notes || '',
                },
              });
            }

            totalUpdated++;
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            totalFailed++;
            results.errors?.push(`Customer ${customer.id}: ${error.message}`);
          }
        }
      } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalUpdated;
    results.failed = totalFailed;
    results.message = `Updated ${totalUpdated} customer lifetime values${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    results.success = false;
    results.message = `Error calculating customer lifetime value: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
