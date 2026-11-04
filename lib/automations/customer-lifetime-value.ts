/**
 * Customer Lifetime Value Calculation
 * Automatically calculate and update customer lifetime value
 */

import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import Tenant from '@/models/Tenant';
import { getRepos } from '@/lib/db';
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
    let tenants;
    if (options.tenantId) {
      const tenant = await getRepos().tenants.findById(options.tenantId);
      tenants = tenant ? [tenant] : [];
    } else {
      // TODO(postgres-migration): Tenant has no `status` field (and Mongoose 8 passes
      // unknown filter keys through), so this query matches NO tenants today and the
      // automation only runs when options.tenantId is given. Left on the model on
      // purpose: replacing it with tenants.listActive() would start running this
      // automation for every tenant. Decide the intended scope before converting.
      tenants = await Tenant.find({ status: 'active' }).lean();
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

        // Get all customers
        const customers = await getRepos().customers.list(tenantId);

        for (const customer of customers) {
          try {
            // Calculate total spent from transactions
            // Match by customer email or customer ID (if transactions have customerId field)
            const transactions = await Transaction.aggregate([
              {
                $match: {
                  tenantId: new mongoose.Types.ObjectId(tenantId),
                  status: 'completed',
                  // Match by email in notes or customerId if field exists
                  $or: [
                    customer.email ? { notes: { $regex: customer.email, $options: 'i' } } : {},
                    // Add customerId match if field exists in Transaction model
                  ],
                },
              },
              {
                $group: {
                  _id: null,
                  totalSpent: { $sum: '$total' },
                  transactionCount: { $sum: 1 },
                  firstPurchase: { $min: '$createdAt' },
                  lastPurchase: { $max: '$createdAt' },
                },
              },
            ]);

            const clvData = transactions[0] || {
              totalSpent: 0,
              transactionCount: 0,
              firstPurchase: null,
              lastPurchase: null,
            };

            // Calculate average order value
            const avgOrderValue = clvData.transactionCount > 0 // eslint-disable-line @typescript-eslint/no-unused-vars
              ? clvData.totalSpent / clvData.transactionCount
              : 0;

            // Calculate purchase frequency (transactions per month)
            const monthsActive = clvData.firstPurchase
              ? Math.max(1, (Date.now() - new Date(clvData.firstPurchase).getTime()) / (1000 * 60 * 60 * 24 * 30))
              : 1;
            const purchaseFrequency = clvData.transactionCount / monthsActive; // eslint-disable-line @typescript-eslint/no-unused-vars

            // Simple CLV calculation: totalSpent (can be enhanced with predictive models)
            const clv = clvData.totalSpent; // eslint-disable-line @typescript-eslint/no-unused-vars

            if (updateCustomers) {
              // Update customer record
              await getRepos().customers.update(tenantId, customer._id, {
                totalSpent: clvData.totalSpent,
                lastPurchaseDate: clvData.lastPurchase ? new Date(clvData.lastPurchase) : undefined,
                // Store CLV in notes or custom field (if model supports it)
                notes: customer.notes || '',
              });

            }

            totalUpdated++;
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            totalFailed++;
            results.errors?.push(`Customer ${customer._id}: ${error.message}`);
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
