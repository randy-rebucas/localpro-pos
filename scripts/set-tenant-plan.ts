import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

import prisma from '../lib/prisma';

const TENANT_SLUG = process.argv[2];
const PLAN_TIER = process.argv[3] || 'enterprise';

if (!TENANT_SLUG) {
  console.error('Usage: npx tsx scripts/set-tenant-plan.ts <tenant-slug> [plan-tier]');
  console.error('Example: npx tsx scripts/set-tenant-plan.ts my-store enterprise');
  console.error('Available tiers: starter, professional, business, enterprise');
  process.exit(1);
}

async function setTenantPlan() {
  try {
    // Find the tenant
    const tenant = await prisma.tenant.findFirst({ where: { slug: TENANT_SLUG } });
    if (!tenant) {
      console.error(`Tenant with slug "${TENANT_SLUG}" not found`);
      process.exit(1);
    }
    console.log(`Found tenant: ${tenant.name} (${tenant.id})`);

    // Find the plan
    const plan = await prisma.subscriptionPlan.findFirst({
      where: { tier: PLAN_TIER as any, isActive: true }, // eslint-disable-line @typescript-eslint/no-explicit-any
    });
    if (!plan) {
      console.error(`Plan with tier "${PLAN_TIER}" not found or inactive`);
      const available = await prisma.subscriptionPlan.findMany({
        where: { isActive: true },
        select: { name: true, tier: true },
      });
      console.log('Available plans:', available.map((p) => `${p.tier} (${p.name})`).join(', '));
      process.exit(1);
    }
    console.log(`Found plan: ${plan.name} (${plan.id})`);

    // Check for existing subscription
    const existing = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });

    if (existing) {
      const billingCycle = PLAN_TIER === 'enterprise' ? 'yearly' : existing.billingCycle;
      const nextBilling = new Date();
      if (billingCycle === 'yearly') {
        nextBilling.setFullYear(nextBilling.getFullYear() + 1);
      } else {
        nextBilling.setMonth(nextBilling.getMonth() + 1);
      }

      await prisma.subscription.update({
        where: { id: existing.id },
        data: {
          planId: plan.id,
          status: 'active',
          isTrial: false,
          billingCycle,
          nextBillingDate: nextBilling,
        },
      });
      console.log(`Updated subscription to ${plan.name} (${plan.tier})`);
    } else {
      // Create new subscription
      const now = new Date();
      const nextBilling = new Date(now);
      if (PLAN_TIER === 'enterprise') {
        nextBilling.setFullYear(nextBilling.getFullYear() + 1);
      } else {
        nextBilling.setMonth(nextBilling.getMonth() + 1);
      }

      await prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status: 'active',
          billingCycle: PLAN_TIER === 'enterprise' ? 'yearly' : 'monthly',
          startDate: now,
          nextBillingDate: nextBilling,
          isTrial: false,
          autoRenew: true,
          usage: {
            currentUsers: 1,
            currentBranches: 1,
            currentProducts: 0,
            currentTransactions: 0,
            lastResetDate: now,
          },
        },
      });

      console.log(`Created new ${plan.name} (${plan.tier}) subscription`);
    }

    console.log('Done!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

setTenantPlan();
