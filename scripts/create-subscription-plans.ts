import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

import prisma from '../lib/prisma';
import { Prisma, type SubscriptionTier } from '@prisma/client';

const subscriptionPlans: Array<{
  name: string;
  tier: SubscriptionTier;
  description: string;
  priceMonthly: number;
  priceSetupFee: number;
  priceCurrency: string;
  features: Record<string, unknown>;
  birCompliance: Record<string, unknown>;
  isActive: boolean;
  isCustom: boolean;
}> = [
  // ──────────────────────────────────────────────
  // BASIC — POS Only
  // One-time setup: ₱50,000–₱70,000
  // Monthly cloud subscription: ₱1,500/month
  // ──────────────────────────────────────────────
  {
    name: 'Basic',
    tier: 'starter',
    description: 'POS software + hardware setup & training. Perfect for micro businesses getting started.',
    priceMonthly: 1500,
    priceSetupFee: 50000,
    priceCurrency: 'PHP',
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
    tier: 'pro',
    description: 'Everything in Basic + BIR Permit-to-Use assistance, receipt formatting, and BIR documentation.',
    priceMonthly: 2500,
    priceSetupFee: 70000,
    priceCurrency: 'PHP',
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
    tier: 'business',
    description: 'Full BIR compliance solution: CAS-ready reporting, complete audit trail, and monthly support.',
    priceMonthly: 5000,
    priceSetupFee: 100000,
    priceCurrency: 'PHP',
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
    tier: 'enterprise',
    description: 'Custom solutions for chains and LGUs. Unlimited everything with dedicated account management.',
    priceMonthly: 0, // Custom pricing
    priceSetupFee: 0, // Custom pricing
    priceCurrency: 'PHP',
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
    // Clear existing plans
    await prisma.subscriptionPlan.deleteMany({});
    console.log('Cleared existing subscription plans');

    // Create new plans
    let created = 0;
    for (const plan of subscriptionPlans) {
      const createdPlan = await prisma.subscriptionPlan.create({
        data: plan as Prisma.SubscriptionPlanCreateInput,
      });
      console.log(`- ${createdPlan.name} (${createdPlan.tier}): ₱${createdPlan.priceMonthly}/month + ₱${createdPlan.priceSetupFee} setup`);
      created++;
    }

    console.log(`Created ${created} subscription plans:`);
    console.log('Subscription plans created successfully!');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error creating subscription plans:', message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createSubscriptionPlans();
