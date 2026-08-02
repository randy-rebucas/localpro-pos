/**
 * Loyalty Milestones Automation
 * Checks customers whose points balance has crossed a reward threshold
 * and auto-generates a personal discount code for them.
 */

import prisma from '@/lib/prisma';

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
  const result: LoyaltyMilestonesResult = { processed: 0, rewardsIssued: 0, errors: [] };

  // Customers who have enough points for at least the first milestone
  const minPoints = MILESTONES[0].points;
  const customers = await prisma.customer.findMany({
    where: { tenantId, isActive: true, loyaltyPointsBalance: { gte: minPoints } },
    select: { id: true, firstName: true, lastName: true, loyaltyPointsBalance: true },
  });

  for (const customer of customers) {
    result.processed++;

    // Find the highest milestone this customer qualifies for
    const milestone = [...MILESTONES]
      .reverse()
      .find((m) => (customer.loyaltyPointsBalance ?? 0) >= m.points);

    if (!milestone) continue;

    // Check if we've already issued this tier's reward recently (within validity window)
    const codePrefix = `LOYALTY-${String(customer.id).slice(-6).toUpperCase()}-${milestone.points}`;
    const existing = await prisma.discount.findFirst({
      where: {
        tenantId,
        code: { startsWith: codePrefix },
        validUntil: { gt: new Date() },
      },
    });

    if (existing) continue; // already has an active reward at this tier

    // Generate unique code
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const code = `${codePrefix}-${suffix}`;

    const validFrom = new Date();
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + CODE_VALID_DAYS);

    try {
      await prisma.discount.create({
        data: {
          tenantId,
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
        },
      });

      // Record the award in loyalty ledger (0-point "adjustment" just for history)
      await prisma.loyaltyTransaction.create({
        data: {
          tenantId,
          customerId: customer.id,
          type: 'adjust',
          points: 0,
          balanceBefore: customer.loyaltyPointsBalance ?? 0,
          balanceAfter: customer.loyaltyPointsBalance ?? 0,
          description: `${milestone.label} discount code issued: ${code}`,
        },
      });

      result.rewardsIssued++;
    } catch (err) {
      result.errors.push(
        `Customer ${String(customer.id)}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return result;
}
