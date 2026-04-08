import connectDB from '@/lib/mongodb';
import Customer from '@/models/Customer';
import Transaction from '@/models/Transaction';
import mongoose from 'mongoose';
import { logger } from '@/lib/logger';

/**
 * Calculate engagement score (0-100) for all customers in a tenant.
 * Score components:
 *   - Recency (40%): Days since last purchase (0-30d=40, 31-60d=30, 61-90d=20, 91-180d=10, 180d+=0)
 *   - Frequency (40%): Number of purchases in last 90 days (1=10, 2-3=25, 4-6=35, 7+=40)
 *   - Loyalty activity (20%): Has loyalty points balance > 0 (20) or > 50 (bonus)
 */
export async function calculateEngagementScores(tenantId: string): Promise<{ updated: number }> {
  await connectDB();
  const tenantObjId = new mongoose.Types.ObjectId(tenantId);
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const customers = await Customer.find({ tenantId, isActive: true }).select('_id lastPurchaseDate loyaltyPointsBalance').lean();

  if (customers.length === 0) return { updated: 0 };

  // Get 90-day purchase frequency per customer
  const frequencyData = await Transaction.aggregate([
    {
      $match: {
        tenantId: tenantObjId,
        status: 'completed',
        createdAt: { $gte: ninetyDaysAgo },
        customerId: { $in: customers.map(c => c._id) },
      },
    },
    { $group: { _id: '$customerId', count: { $sum: 1 } } },
  ]);

  const freqMap = new Map(frequencyData.map((f: { _id: mongoose.Types.ObjectId; count: number }) => [f._id.toString(), f.count]));

  const updates: { updateOne: { filter: { _id: mongoose.Types.ObjectId }; update: { $set: { engagementScore: number } } } }[] = [];

  for (const customer of customers) {
    // Recency score (0-40)
    let recency = 0;
    if (customer.lastPurchaseDate) {
      const daysSince = (now.getTime() - new Date(customer.lastPurchaseDate).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince <= 30) recency = 40;
      else if (daysSince <= 60) recency = 30;
      else if (daysSince <= 90) recency = 20;
      else if (daysSince <= 180) recency = 10;
    }

    // Frequency score (0-40)
    const freq = freqMap.get(customer._id.toString()) || 0;
    let frequency = 0;
    if (freq >= 7) frequency = 40;
    else if (freq >= 4) frequency = 35;
    else if (freq >= 2) frequency = 25;
    else if (freq === 1) frequency = 10;

    // Loyalty score (0-20)
    const points = customer.loyaltyPointsBalance || 0;
    const loyalty = points > 100 ? 20 : points > 50 ? 15 : points > 0 ? 10 : 0;

    const score = Math.min(100, recency + frequency + loyalty);

    updates.push({
      updateOne: {
        filter: { _id: customer._id as mongoose.Types.ObjectId },
        update: { $set: { engagementScore: score } },
      },
    });
  }

  if (updates.length > 0) {
    await Customer.bulkWrite(updates);
  }

  logger.info(`Engagement scores updated for ${updates.length} customers in tenant ${tenantId}`);
  return { updated: updates.length };
}
