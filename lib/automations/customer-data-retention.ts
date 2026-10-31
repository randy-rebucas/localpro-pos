/**
 * Customer Data Retention
 * Anonymises customers that have been deactivated (soft-deleted) for longer than
 * the retention period, in line with the Data Privacy Act principle of keeping
 * personal data only as long as needed. The customer row itself is kept so that
 * historical transactions, loyalty and balance records still resolve.
 */

import connectDB from '@/lib/mongodb';
import Customer from '@/models/Customer';
import { getAutomationTenants } from './tenants';
import { AutomationResult } from './types';

export const DEFAULT_CUSTOMER_RETENTION_YEARS = 5;

export interface CustomerDataRetentionOptions {
  tenantId?: string;
  retentionYears?: number; // Years after deactivation (min/default: 5)
}

export async function anonymizeInactiveCustomers(
  options: CustomerDataRetentionOptions = {}
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
    const retentionYears = Math.max(
      DEFAULT_CUSTOMER_RETENTION_YEARS,
      options.retentionYears || DEFAULT_CUSTOMER_RETENTION_YEARS
    );
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - retentionYears);
    const now = new Date();

    const tenants = await getAutomationTenants({ tenantId: options.tenantId, select: 'name' });

    for (const tenant of tenants) {
      try {
        // One write per anonymised customer, no reads. Customers deactivated
        // before deactivatedAt existed fall back to their last update time.
        const result = await Customer.updateMany(
          {
            tenantId: tenant._id,
            isActive: false,
            anonymizedAt: { $exists: false },
            // Never touch customers who still owe (or are owed) money.
            accountBalance: { $in: [0, null] },
            $or: [
              { deactivatedAt: { $lt: cutoff } },
              { deactivatedAt: { $exists: false }, updatedAt: { $lt: cutoff } },
            ],
          },
          {
            $set: { firstName: 'Deleted', lastName: 'Customer', anonymizedAt: now },
            $unset: {
              email: '',
              phone: '',
              addresses: '',
              dateOfBirth: '',
              notes: '',
              tags: '',
              shopifyCustomerId: '',
            },
          }
        );
        results.processed += result.modifiedCount ?? 0;
      } catch (error: unknown) {
        results.failed++;
        const message = error instanceof Error ? error.message : String(error);
        results.errors?.push(`Tenant ${tenant.name}: ${message}`);
      }
    }

    results.message = `Anonymised ${results.processed} customer(s)${results.failed > 0 ? `, ${results.failed} tenant(s) failed` : ''}`;
    return results;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    results.success = false;
    results.message = `Error applying customer data retention: ${message}`;
    results.errors?.push(message);
    return results;
  }
}
