import connectDB from '@/lib/mongodb';
import ProductBatch from '@/models/ProductBatch';
import Tenant from '@/models/Tenant';
import User from '@/models/User';
import { sendEmail } from '@/lib/notifications';
import { logger } from '@/lib/logger';

const ALERT_DAYS = [7, 14, 30]; // Alert when expiry is this many days away

/**
 * Check all tenants for batches expiring within ALERT_DAYS and notify owners.
 */
export async function checkExpiryAlerts(): Promise<{ tenants: number; alertsSent: number }> {
  await connectDB();
  const tenants = await Tenant.find({ isActive: true }).select('_id slug').lean();

  let totalAlerts = 0;

  for (const tenant of tenants) {
    try {
      const now = new Date();
      const maxCutoff = new Date(now.getTime() + Math.max(...ALERT_DAYS) * 24 * 60 * 60 * 1000);

      const expiringBatches = await ProductBatch.find({
        tenantId: tenant._id,
        isActive: true,
        expiryDate: { $exists: true, $gte: now, $lte: maxCutoff },
        remainingQuantity: { $gt: 0 },
      })
        .populate('productId', 'name sku')
        .lean();

      if (expiringBatches.length === 0) continue;

      // Get owner email
      const owner = await User.findOne({ tenantId: tenant._id, role: { $in: ['owner', 'admin'] }, isActive: true })
        .select('email name')
        .lean();

      if (!owner?.email) continue;

      const batchLines = expiringBatches.map((b: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const daysLeft = Math.ceil((new Date(b.expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return `• ${(b.productId as any)?.name} (Batch: ${b.batchNumber}) — ${b.remainingQuantity} units — expires in ${daysLeft} days`; // eslint-disable-line @typescript-eslint/no-explicit-any
      }).join('\n');

      await sendEmail({
        to: owner.email,
        subject: `⚠️ ${expiringBatches.length} product batch(es) expiring soon`,
        message: `Hello ${owner.name},\n\nThe following product batches are expiring soon:\n\n${batchLines}\n\nPlease take action to prevent waste.`,
        type: 'email',
      });

      totalAlerts++;
      logger.info(`Expiry alert sent to ${owner.email} for tenant ${tenant.slug} — ${expiringBatches.length} batches`);
    } catch (err) {
      logger.error(`Expiry alert failed for tenant ${tenant._id}`, err);
    }
  }

  return { tenants: tenants.length, alertsSent: totalAlerts };
}
