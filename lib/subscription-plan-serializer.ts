import type { SubscriptionPlan, Subscription } from '@prisma/client';

/**
 * Legacy client shape for a plan (hooks/useSubscriptionPlans.ts,
 * hooks/useSubscriptionManager.ts): `_id` plus the nested `price`, `features`
 * and `birCompliance` objects that the Postgres schema flattened into columns.
 */
export function serializePlan(p: SubscriptionPlan) {
  return {
    ...p,
    _id: p.id,
    price: {
      monthly: Number(p.priceMonthly),
      setupFee: Number(p.priceSetupFee),
      currency: p.priceCurrency,
    },
    features: {
      maxUsers: p.maxUsers,
      maxBranches: p.maxBranches,
      maxProducts: p.maxProducts,
      maxTransactions: p.maxTransactions,
      enableInventory: p.enableInventory,
      enableCategories: p.enableCategories,
      enableDiscounts: p.enableDiscounts,
      enableLoyaltyProgram: p.enableLoyaltyProgram,
      enableCustomerManagement: p.enableCustomerManagement,
      enableBookingScheduling: p.enableBookingScheduling,
      enableTableManagement: p.enableTableManagement,
      enableReports: p.enableReports,
      enableMultiBranch: p.enableMultiBranch,
      enableHardwareIntegration: p.enableHardwareIntegration,
      prioritySupport: p.prioritySupport,
      customIntegrations: p.customIntegrations,
      dedicatedAccountManager: p.dedicatedAccountManager,
    },
    birCompliance: {
      ptuAssistance: p.birPtuAssistance,
      receiptFormatting: p.birReceiptFormatting,
      birDocumentation: p.birDocumentation,
      casReporting: p.birCasReporting,
      auditTrailSystem: p.birAuditTrailSystem,
      monthlySupport: p.birMonthlySupport,
    },
  };
}

/**
 * Legacy client shape for a tenant's subscription (hooks/useSubscriptionManager.ts):
 * `_id`, a populated `planId` plan object, a nested `usage` object, and a
 * numeric `outstandingBalance`.
 */
export function serializeSubscription(s: Subscription & { plan?: SubscriptionPlan | null }) {
  const { plan, ...rest } = s;
  return {
    ...rest,
    _id: s.id,
    planId: plan ? serializePlan(plan) : s.planId,
    outstandingBalance: Number(s.outstandingBalance),
    usage: {
      currentUsers: s.usageCurrentUsers,
      currentBranches: s.usageCurrentBranches,
      currentProducts: s.usageCurrentProducts,
      currentTransactions: s.usageCurrentTransactions,
    },
  };
}
