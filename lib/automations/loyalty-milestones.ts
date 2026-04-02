/**
 * Loyalty Milestones Automation
 * Checks customers whose points balance has crossed a reward threshold
 * and auto-generates a personal discount code for them.
 */

import connectDB from '@/lib/mongodb';
import Customer from '@/models/Customer';
import Discount from '@/models/Discount';
import LoyaltyTransaction from '@/models/LoyaltyTransaction';
import mongoose from 'mongoose';

// Points thresholds → reward config
const MILESTONES: Array<{ points: number; discountPct: number; label: string }> = [
  { points: 500,  discountPct: 5,  label: 'Bronze Reward' },
  { points: 1000, discountPct: 10, label: 'Silver Reward' },
  { points: 2000, discountPct: 15, label: 'Gold Reward' },
  { points: 5000, discountPct: 20, label: 'Platinum Reward' },
];

// Validity period for generated discount codes (days)
const CODE_VALID_DAYS = 30;

export interface LoyaltyMilestonesResult {
  processed: number;
  rewardsIssued: number;
  errors: string[];
}

export async function runLoyaltyMilestones(
  tenantId: string
): Promise<LoyaltyMilestonesResult> {
  await connectDB();

  const result: LoyaltyMilestonesResult = { processed: 0, rewardsIssued: 0, errors: [] };

  const tid = new mongoose.Types.ObjectId(tenantId);

  // Customers who have enough points for at least the first milestone
  const minPoints = MILESTONES[0].points;
  const customers = await Customer.find(
    { tenantId: tid, isActive: true, loyaltyPointsBalance: { $gte: minPoints } },
    { _id: 1, firstName: 1, lastName: 1, loyaltyPointsBalance: 1 }
  ).lean();

  for (const customer of customers) {
    result.processed++;

    // Find the highest milestone this customer qualifies for
    const milestone = [...MILESTONES]
      .reverse()
      .find((m) => (customer.loyaltyPointsBalance ?? 0) >= m.points);

    if (!milestone) continue;

    // Check if we've already issued this tier's reward recently (within validity window)
    const codePrefix = `LOYALTY-${String(customer._id).slice(-6).toUpperCase()}-${milestone.points}`;
    const existing = await Discount.findOne({
      tenantId: tid,
      code: { $regex: `^${codePrefix}` },
      validUntil: { $gt: new Date() },
    }).lean();

    if (existing) continue; // already has an active reward at this tier

    // Generate unique code
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const code = `${codePrefix}-${suffix}`;

    const validFrom = new Date();
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + CODE_VALID_DAYS);

    try {
      await Discount.create({
        tenantId: tid,
        code,
        name: `${milestone.label} — ${customer.firstName} ${customer.lastName}`,
        description: `Auto-generated loyalty reward for reaching ${milestone.points} points`,
        type: 'percentage',
        value: milestone.discountPct,
        category: 'promo',
        validFrom,
        validUntil,
        usageLimit: 1,
        usageCount: 0,
        isActive: true,
      });

      // Record the award in loyalty ledger (0-point "adjustment" just for history)
      await LoyaltyTransaction.create({
        tenantId: tid,
        customerId: customer._id,
        type: 'adjust',
        points: 0,
        balanceBefore: customer.loyaltyPointsBalance ?? 0,
        balanceAfter: customer.loyaltyPointsBalance ?? 0,
        description: `${milestone.label} discount code issued: ${code}`,
      });

      result.rewardsIssued++;
    } catch (err) {
      result.errors.push(
        `Customer ${String(customer._id)}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return result;
}
