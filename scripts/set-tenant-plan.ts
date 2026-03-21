import mongoose from 'mongoose';
import Subscription from '../models/Subscription';
import SubscriptionPlan from '../models/SubscriptionPlan';
import Tenant from '../models/Tenant';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

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
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('Connected to MongoDB');

    // Find the tenant
    const tenant = await Tenant.findOne({ slug: TENANT_SLUG });
    if (!tenant) {
      console.error(`Tenant with slug "${TENANT_SLUG}" not found`);
      process.exit(1);
    }
    console.log(`Found tenant: ${tenant.name} (${tenant._id})`);

    // Find the plan
    const plan = await SubscriptionPlan.findOne({ tier: PLAN_TIER, isActive: true });
    if (!plan) {
      console.error(`Plan with tier "${PLAN_TIER}" not found or inactive`);
      const available = await SubscriptionPlan.find({ isActive: true }, 'name tier').lean();
      console.log('Available plans:', available.map(p => `${p.tier} (${p.name})`).join(', '));
      process.exit(1);
    }
    console.log(`Found plan: ${plan.name} (${plan._id})`);

    // Check for existing subscription
    const existing = await Subscription.findOne({ tenantId: tenant._id });

    if (existing) {
      // Update existing subscription using findByIdAndUpdate to skip
      // full document validation (existing billingHistory may have bad data)
      const billingCycle = PLAN_TIER === 'enterprise' ? 'yearly' : existing.billingCycle;
      const nextBilling = new Date();
      if (billingCycle === 'yearly') {
        nextBilling.setFullYear(nextBilling.getFullYear() + 1);
      } else {
        nextBilling.setMonth(nextBilling.getMonth() + 1);
      }

      // Also fix any billingHistory entries missing required 'date'
      const fixedHistory = (existing.billingHistory || []).map((entry: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        ...entry.toObject ? entry.toObject() : entry,
        date: entry.date || existing.createdAt || new Date(),
      }));

      await Subscription.findByIdAndUpdate(existing._id, {
        planId: plan._id,
        status: 'active',
        isTrial: false,
        billingCycle,
        nextBillingDate: nextBilling,
        billingHistory: fixedHistory,
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

      const subscription = await Subscription.create({
        tenantId: tenant._id,
        planId: plan._id,
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
      });

      await Tenant.findByIdAndUpdate(tenant._id, { subscriptionId: subscription._id });
      console.log(`Created new ${plan.name} (${plan.tier}) subscription`);
    }

    console.log('Done!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

setTenantPlan();
