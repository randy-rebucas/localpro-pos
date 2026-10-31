/**
 * Customer Lifetime Value Calculation
 * Automatically calculate and update customer lifetime value
 */

import connectDB from '@/lib/mongodb';
import Customer from '@/models/Customer';
import Transaction from '@/models/Transaction';
import { getAutomationTenants } from './tenants';
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
  await connectDB();

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
    const tenants = await getAutomationTenants({ tenantId: options.tenantId, select: 'name' });

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalUpdated = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id;

        // Calculate totals for every customer in one aggregate over completed
        // transactions linked by customerId
        const stats: { _id: unknown; totalSpent: number; lastPurchase: Date }[] =
          await Transaction.aggregate([
            {
              $match: {
                tenantId,
                status: 'completed',
                customerId: { $ne: null },
              },
            },
            {
              $group: {
                _id: '$customerId',
                totalSpent: { $sum: '$total' },
                lastPurchase: { $max: '$createdAt' },
              },
            },
          ]);
        const statsByCustomer = new Map(stats.map((s) => [String(s._id), s]));

        // Get all customers (only the fields being compared)
        const customers = await Customer.find({ tenantId })
          .select('_id totalSpent lastPurchaseDate')
          .lean();

        // Simple CLV calculation: totalSpent (can be enhanced with predictive models).
        // Only write customers whose computed values changed.
        const updates = [];
        for (const customer of customers) {
          const clvData = statsByCustomer.get(String(customer._id));
          const totalSpent = clvData?.totalSpent ?? 0;
          const lastPurchase = clvData?.lastPurchase ? new Date(clvData.lastPurchase) : undefined;

          const $set: Record<string, unknown> = {};
          if (Math.abs((customer.totalSpent ?? 0) - totalSpent) > 1e-9) {
            $set.totalSpent = totalSpent;
          }
          if (lastPurchase && customer.lastPurchaseDate?.getTime() !== lastPurchase.getTime()) {
            $set.lastPurchaseDate = lastPurchase;
          }
          if (Object.keys($set).length === 0) continue;

          updates.push({
            updateOne: {
              filter: { tenantId, _id: customer._id },
              update: { $set },
            },
          });
        }

        if (updateCustomers && updates.length > 0) {
          // Derived stats: don't bump updatedAt (customer-data-retention uses it
          // as the deactivation time for customers predating deactivatedAt).
          await Customer.bulkWrite(updates, { ordered: false, timestamps: false });
        }

        totalUpdated += updates.length;
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
