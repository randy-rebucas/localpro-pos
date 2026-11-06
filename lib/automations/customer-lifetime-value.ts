/**
 * Customer Lifetime Value Calculation
 * Automatically calculate and update customer lifetime value
 */

import connectDB from '@/lib/mongodb';
import Customer from '@/models/Customer';
import Transaction from '@/models/Transaction';
import Tenant from '@/models/Tenant';
import { getActiveTenants, type ActiveTenant } from '@/lib/tenant-active-query';
import { REPORT_MAX_TIME_MS } from '@/lib/query-utils';
import { AutomationResult } from './types';
import mongoose from 'mongoose';

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
    let tenants: ActiveTenant[];
    if (options.tenantId) {
      const tenant = await Tenant.findById(options.tenantId).select('_id slug name').lean<ActiveTenant>();
      tenants = tenant ? [tenant] : [];
    } else {
      tenants = await getActiveTenants();
    }

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalUpdated = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id.toString();

        // One pass per tenant, net of refunds. Customers with no linked sales are
        // left as they are.
        const totals = await Transaction.aggregate<{ _id: mongoose.Types.ObjectId; totalSpent: number; lastPurchase: Date }>([
          {
            $match: {
              tenantId: new mongoose.Types.ObjectId(tenantId),
              status: 'completed',
              customerId: { $exists: true, $ne: null },
            },
          },
          {
            $group: {
              _id: '$customerId',
              totalSpent: { $sum: { $subtract: ['$total', { $ifNull: ['$refundedAmount', 0] }] } },
              lastPurchase: { $max: '$createdAt' },
            },
          },
        ]).option({ maxTimeMS: REPORT_MAX_TIME_MS });

        if (updateCustomers && totals.length > 0) {
          await Customer.bulkWrite(
            totals.map((row) => ({
              updateOne: {
                filter: { _id: row._id, tenantId: new mongoose.Types.ObjectId(tenantId) },
                update: { $set: { totalSpent: row.totalSpent, lastPurchaseDate: row.lastPurchase } },
              },
            })),
            { ordered: false }
          );
        }

        totalUpdated += totals.length;
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
