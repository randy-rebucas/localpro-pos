/**
 * Customer Lifetime Value Calculation
 * Automatically calculate and update customer lifetime value
 */

import connectDB from '@/lib/mongodb';
import Customer from '@/models/Customer';
import Transaction from '@/models/Transaction';
import Tenant from '@/models/Tenant';
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
      const tenant = await Tenant.findById(options.tenantId).lean();
      tenants = tenant ? [tenant] : [];
    } else {
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
        const customers = await Customer.find({ tenantId }).lean();

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

            // Simple CLV calculation: totalSpent (can be enhanced with predictive models)
            // Note: avgOrderValue, purchaseFrequency, and clv calculations removed as they were unused

            if (updateCustomers) {
              // Update customer record
              await Customer.findByIdAndUpdate(customer._id, {
                totalSpent: clvData.totalSpent,
                lastPurchaseDate: clvData.lastPurchase ? new Date(clvData.lastPurchase) : undefined,
                // Store CLV in notes or custom field (if model supports it)
                notes: customer.notes || '',
              });
            }

            totalUpdated++;
          } catch (error: unknown) {
            totalFailed++;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            results.errors?.push(`Customer ${customer._id}: ${errorMessage}`);
          }
        }
      } catch (error: unknown) {
        totalFailed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.errors?.push(`Tenant ${tenant.name}: ${errorMessage}`);
      }
    }

    results.processed = totalUpdated;
    results.failed = totalFailed;
    results.message = `Updated ${totalUpdated} customer lifetime values${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: unknown) {
    results.success = false;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    results.message = `Error calculating customer lifetime value: ${errorMessage}`;
    results.errors?.push(errorMessage);
    return results;
  }
}
