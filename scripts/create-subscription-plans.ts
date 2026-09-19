import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import prisma from '../lib/db';

// Load environment variables
dotenv.config({ path: '.env.local' });

const subscriptionPlans = [
  // ──────────────────────────────────────────────
  // BASIC — POS Only
  // One-time setup: ₱50,000–₱70,000
  // Monthly cloud subscription: ₱1,500/month
  // ──────────────────────────────────────────────
  {
    name: 'Basic',
    tier: 'starter' as const,
    description: 'POS software + hardware setup & training. Perfect for micro businesses getting started.',
    price: {
      monthly: 1500,
      setupFee: 50000,
      currency: 'PHP',
    },
    features: {
      maxUsers: 3,
      maxBranches: 1,
      maxProducts: 100,
      maxTransactions: 1000,
      enableInventory: true,
      enableCategories: true,
      enableDiscounts: false,
      enableLoyaltyProgram: false,
      enableCustomerManagement: false,
      enableBookingScheduling: false,
      enableReports: true,
      enableMultiBranch: false,
      enableHardwareIntegration: true,
      prioritySupport: false,
      customIntegrations: false,
      dedicatedAccountManager: false,
    },
    birCompliance: {
      ptuAssistance: false,
      receiptFormatting: false,
      birDocumentation: false,
      casReporting: false,
      auditTrailSystem: true,
      monthlySupport: false,
    },
    isActive: true,
    isCustom: false,
  },
  // ──────────────────────────────────────────────
  // STANDARD — POS + BIR Setup
  // One-time setup: ₱70,000–₱100,000
  // Monthly cloud subscription: ₱2,500/month
  // ──────────────────────────────────────────────
  {
    name: 'Standard',
    tier: 'pro' as const,
    description: 'Everything in Basic + BIR Permit-to-Use assistance, receipt formatting, and BIR documentation.',
    price: {
      monthly: 2500,
      setupFee: 70000,
      currency: 'PHP',
    },
    features: {
      maxUsers: 10,
      maxBranches: 2,
      maxProducts: 1000,
      maxTransactions: 10000,
      enableInventory: true,
      enableCategories: true,
      enableDiscounts: true,
      enableLoyaltyProgram: true,
      enableCustomerManagement: true,
      enableBookingScheduling: false,
      enableReports: true,
      enableMultiBranch: false,
      enableHardwareIntegration: true,
      prioritySupport: false,
      customIntegrations: false,
      dedicatedAccountManager: false,
    },
    birCompliance: {
      ptuAssistance: true,
      receiptFormatting: true,
      birDocumentation: true,
      casReporting: false,
      auditTrailSystem: true,
      monthlySupport: false,
    },
    isActive: true,
    isCustom: false,
  },
  // ──────────────────────────────────────────────
  // PREMIUM — Full BIR Compliance Solution
  // One-time setup: ₱100,000–₱150,000
  // Monthly cloud subscription: ₱5,000/month
  // ──────────────────────────────────────────────
  {
    name: 'Premium',
    tier: 'business' as const,
    description: 'Full BIR compliance solution: CAS-ready reporting, complete audit trail, and monthly support.',
    price: {
      monthly: 5000,
      setupFee: 100000,
      currency: 'PHP',
    },
    features: {
      maxUsers: 25,
      maxBranches: 5,
      maxProducts: 5000,
      maxTransactions: 50000,
      enableInventory: true,
      enableCategories: true,
      enableDiscounts: true,
      enableLoyaltyProgram: true,
      enableCustomerManagement: true,
      enableBookingScheduling: true,
      enableReports: true,
      enableMultiBranch: true,
      enableHardwareIntegration: true,
      prioritySupport: true,
      customIntegrations: false,
      dedicatedAccountManager: false,
    },
    birCompliance: {
      ptuAssistance: true,
      receiptFormatting: true,
      birDocumentation: true,
      casReporting: true,
      auditTrailSystem: true,
      monthlySupport: true,
    },
    isActive: true,
    isCustom: false,
  },
  // ──────────────────────────────────────────────
  // ENTERPRISE — Custom Solutions
  // Custom pricing for chains and LGUs
  // ──────────────────────────────────────────────
  {
    name: 'Enterprise',
    tier: 'enterprise' as const,
    description: 'Custom solutions for chains and LGUs. Unlimited everything with dedicated account management.',
    price: {
      monthly: 0, // Custom pricing
      setupFee: 0, // Custom pricing
      currency: 'PHP',
    },
    features: {
      maxUsers: -1, // Unlimited
      maxBranches: -1, // Unlimited
      maxProducts: -1, // Unlimited
      maxTransactions: -1, // Unlimited
      enableInventory: true,
      enableCategories: true,
      enableDiscounts: true,
      enableLoyaltyProgram: true,
      enableCustomerManagement: true,
      enableBookingScheduling: true,
      enableReports: true,
      enableMultiBranch: true,
      enableHardwareIntegration: true,
      prioritySupport: true,
      customIntegrations: true,
      dedicatedAccountManager: true,
    },
    birCompliance: {
      ptuAssistance: true,
      receiptFormatting: true,
      birDocumentation: true,
      casReporting: true,
      auditTrailSystem: true,
      monthlySupport: true,
    },
    isActive: true,
    isCustom: true,
  },
];

async function createSubscriptionPlans() {
  try {
    console.log('Connecting to database...');

    // Upsert by tier (unique) so this stays idempotent/safe to run twice,
    // instead of the old Mongo script's deleteMany + insertMany (which would
    // also cascade-orphan any existing Subscription.planId references).
    const createdPlans = [];
    for (const plan of subscriptionPlans) {
      const data = {
        name: plan.name,
        tier: plan.tier,
        description: plan.description,
        priceMonthly: plan.price.monthly,
        priceSetupFee: plan.price.setupFee || 0,
        priceCurrency: plan.price.currency || 'PHP',
        maxUsers: plan.features.maxUsers,
        maxBranches: plan.features.maxBranches,
        maxProducts: plan.features.maxProducts,
        maxTransactions: plan.features.maxTransactions,
        enableInventory: plan.features.enableInventory,
        enableCategories: plan.features.enableCategories,
        enableDiscounts: plan.features.enableDiscounts,
        enableLoyaltyProgram: plan.features.enableLoyaltyProgram,
        enableCustomerManagement: plan.features.enableCustomerManagement,
        enableBookingScheduling: plan.features.enableBookingScheduling,
        enableReports: plan.features.enableReports,
        enableMultiBranch: plan.features.enableMultiBranch,
        enableHardwareIntegration: plan.features.enableHardwareIntegration,
        prioritySupport: plan.features.prioritySupport,
        customIntegrations: plan.features.customIntegrations,
        dedicatedAccountManager: plan.features.dedicatedAccountManager,
        birPtuAssistance: plan.birCompliance.ptuAssistance,
        birReceiptFormatting: plan.birCompliance.receiptFormatting,
        birDocumentation: plan.birCompliance.birDocumentation,
        birCasReporting: plan.birCompliance.casReporting,
        birAuditTrailSystem: plan.birCompliance.auditTrailSystem,
        birMonthlySupport: plan.birCompliance.monthlySupport,
        isActive: plan.isActive,
        isCustom: plan.isCustom,
      };

      const created = await prisma.subscriptionPlan.upsert({
        where: { tier: plan.tier },
        create: { id: randomUUID(), ...data },
        update: data,
      });
      createdPlans.push(created);
    }

    console.log(`Upserted ${createdPlans.length} subscription plans:`);
    createdPlans.forEach((plan) => {
      console.log(`- ${plan.name} (${plan.tier}): ₱${plan.priceMonthly}/month + ₱${plan.priceSetupFee} setup`);
    });

    console.log('Subscription plans created successfully!');
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Error creating subscription plans:', error.message);
    process.exit(1);
  }
}

createSubscriptionPlans()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
