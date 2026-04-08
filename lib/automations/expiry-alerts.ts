import connectDB from '@/lib/mongodb';
import ProductBatch from '@/models/ProductBatch';
import Tenant from '@/models/Tenant';
import User from '@/models/User';
import { sendEmail } from '@/lib/notifications';
import { logger } from '@/lib/logger';

const ALERT_DAYS = [7, 14, 30]; // Alert when expiry is within these many days
const MAX_CUTOFF_DAYS = Math.max(...ALERT_DAYS);
const CONCURRENCY = 5; // Process N tenants in parallel

/**
 * Run up to `concurrency` async tasks concurrently from an array.
 */
async function pMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = await Promise.allSettled(items.slice(i, i + concurrency).map(fn));
    for (const r of batch) {
      if (r.status === 'fulfilled') results.push(r.value);
    }
  }
  return results;
}

interface TenantAlertResult {
  tenantId: string;
  emailsSent: number;
  batchesFound: number;
}

async function processOneTenant(tenant: { _id: unknown; slug?: string }): Promise<TenantAlertResult> {
  const tenantId = (tenant._id as { toString(): string }).toString();
  const now = new Date();
  const maxCutoff = new Date(now.getTime() + MAX_CUTOFF_DAYS * 24 * 60 * 60 * 1000);

  const expiringBatches = await ProductBatch.find({
    tenantId: tenant._id,
    isActive: true,
    expiryDate: { $exists: true, $gte: now, $lte: maxCutoff },
    remainingQuantity: { $gt: 0 },
  })
    .populate<{ productId: { name: string; sku: string } }>('productId', 'name sku')
    .lean();

  if (expiringBatches.length === 0) {
    return { tenantId, emailsSent: 0, batchesFound: 0 };
  }

  // Notify all owners and admins (not just the first one)
  const recipients = await User.find({
    tenantId: tenant._id,
    role: { $in: ['owner', 'admin'] },
    isActive: true,
  })
    .select('email name')
    .lean();

  if (recipients.length === 0) {
    return { tenantId, emailsSent: 0, batchesFound: expiringBatches.length };
  }

  const batchLines = expiringBatches
    .map((b: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const daysLeft = Math.ceil(
        (new Date(b.expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      const urgency = daysLeft <= 7 ? '🔴' : daysLeft <= 14 ? '🟡' : '🟢';
      return `${urgency} ${b.productId?.name ?? 'Unknown product'} (Batch: ${b.batchNumber}) — ${b.remainingQuantity} units — expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
    })
    .join('\n');

  let emailsSent = 0;
  await Promise.allSettled(
    recipients.map(async (recipient) => {
      try {
        await sendEmail({
          to: recipient.email,
          subject: `⚠️ ${expiringBatches.length} product batch(es) expiring within ${MAX_CUTOFF_DAYS} days`,
          message: `Hello ${recipient.name},\n\nThe following product batches require your attention:\n\n${batchLines}\n\nPlease take action to prevent waste or plan promotions accordingly.`,
          type: 'email',
        });
        emailsSent++;
        logger.info(`Expiry alert sent to ${recipient.email} for tenant ${tenant.slug ?? tenantId}`);
      } catch (err) {
        logger.error(`Failed to send expiry alert to ${recipient.email}`, err);
      }
    })
  );

  return { tenantId, emailsSent, batchesFound: expiringBatches.length };
}

/**
 * Check all tenants for batches expiring within ALERT_DAYS and notify owners/admins.
 * Processes tenants in parallel (up to CONCURRENCY at a time).
 */
export async function checkExpiryAlerts(): Promise<{ tenants: number; alertsSent: number; batchesFound: number }> {
  await connectDB();
  const tenants = await Tenant.find({ isActive: true }).select('_id slug').lean();

  const results = await pMap(tenants, processOneTenant, CONCURRENCY);

  const alertsSent   = results.reduce((s, r) => s + r.emailsSent,   0);
  const batchesFound = results.reduce((s, r) => s + r.batchesFound, 0);

  logger.info(`Expiry alert run complete — ${tenants.length} tenants, ${batchesFound} expiring batches, ${alertsSent} emails sent`);
  return { tenants: tenants.length, alertsSent, batchesFound };
}
