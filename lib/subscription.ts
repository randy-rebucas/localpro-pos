import prisma from '@/lib/db';
import { logger } from '@/lib/logger';
import type { Subscription, SubscriptionPlan, Prisma } from '@prisma/client';

export interface SubscriptionLimits {
  maxUsers: number;
  maxBranches: number;
  maxProducts: number;
  maxTransactions: number;
}

export interface SubscriptionFeatures {
  enableInventory: boolean;
  enableCategories: boolean;
  enableDiscounts: boolean;
  enableLoyaltyProgram: boolean;
  enableCustomerManagement: boolean;
  enableBookingScheduling: boolean;
  enableTableManagement: boolean;
  enableReports: boolean;
  enableMultiBranch: boolean;
  enableHardwareIntegration: boolean;
  prioritySupport: boolean;
  customIntegrations: boolean;
  dedicatedAccountManager: boolean;
}

export interface BirComplianceFeatures {
  ptuAssistance: boolean;
  receiptFormatting: boolean;
  birDocumentation: boolean;
  casReporting: boolean;
  auditTrailSystem: boolean;
  monthlySupport: boolean;
}

export interface PharmacyComplianceFeatures {
  enablePharmacyCompliance: boolean;
  prescriptionManagement: boolean;
  expiryTracking: boolean;
  pdeaReporting: boolean;
}

export interface SubscriptionStatus {
  isActive: boolean;
  isTrial: boolean;
  isExpired: boolean;
  isTrialExpired: boolean;
  planName: string;
  limits: SubscriptionLimits;
  features: SubscriptionFeatures;
  birCompliance: BirComplianceFeatures;
  pharmacyCompliance: PharmacyComplianceFeatures;
  usage: {
    currentUsers: number;
    currentBranches: number;
    currentProducts: number;
    currentTransactions: number;
  };
  billingCycle: 'monthly' | 'yearly';
  trialEndDate?: Date | null;
  nextBillingDate?: Date | null;
}

export class SubscriptionService {
  /**
   * Get subscription status for a tenant
   */
  static async getSubscriptionStatus(tenantId: string): Promise<SubscriptionStatus | null> {
    try {
      // CRITICAL: findUnique on tenantId (unique 1:1) keeps this scoped to
      // exactly one tenant — never a findFirst/list query that could leak
      // another tenant's subscription. See documented cross-tenant leak
      // history in subscriptions endpoints.
      const subscription = await prisma.subscription.findUnique({
        where: { tenantId },
      });

      if (!subscription) {
        return null;
      }

      let plan: SubscriptionPlan | null = await prisma.subscriptionPlan.findUnique({
        where: { id: subscription.planId },
      });

      const now = new Date();

      // Handle orphaned planId (plan was deleted/recreated)
      if (!plan) {
        const fallbackPlan = await prisma.subscriptionPlan.findFirst({
          where: { tier: 'starter', isActive: true },
        });
        if (fallbackPlan) {
          // Reassign subscription to the current starter plan
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: { planId: fallbackPlan.id },
          });
          plan = fallbackPlan;
        } else {
          // Subscription exists but plan data is unavailable — return a safe fallback
          // so onboarding is not blocked by a null status.
          logger.warn('Subscription has missing plan; using fallback status', { tenantId });
          return {
            isActive: subscription.status === 'active',
            isTrial: subscription.isTrial || subscription.status === 'trial',
            isExpired: subscription.endDate ? now > subscription.endDate : false,
            isTrialExpired: subscription.trialEndDate ? now > subscription.trialEndDate : false,
            planName: 'Starter',
            billingCycle: subscription.billingCycle as 'monthly' | 'yearly',
            trialEndDate: subscription.trialEndDate,
            nextBillingDate: subscription.nextBillingDate,
            limits: {
              maxUsers: 2,
              maxBranches: 1,
              maxProducts: 100,
              maxTransactions: 500,
            },
            features: {
              enableInventory: true,
              enableCategories: true,
              enableDiscounts: false,
              enableLoyaltyProgram: false,
              enableCustomerManagement: false,
              enableBookingScheduling: false,
              enableTableManagement: false,
              enableReports: true,
              enableMultiBranch: false,
              enableHardwareIntegration: false,
              prioritySupport: false,
              customIntegrations: false,
              dedicatedAccountManager: false,
            },
            birCompliance: {
              ptuAssistance: false,
              receiptFormatting: false,
              birDocumentation: false,
              casReporting: false,
              auditTrailSystem: false,
              monthlySupport: false,
            },
            pharmacyCompliance: {
              enablePharmacyCompliance: false,
              prescriptionManagement: false,
              expiryTracking: false,
              pdeaReporting: false,
            },
            usage: {
              currentUsers: subscription.usageCurrentUsers,
              currentBranches: subscription.usageCurrentBranches,
              currentProducts: subscription.usageCurrentProducts,
              currentTransactions: subscription.usageCurrentTransactions,
            },
          };
        }
      }

      const status: SubscriptionStatus = {
        isActive: subscription.status === 'active',
        isTrial: subscription.isTrial,
        isExpired: subscription.endDate ? now > subscription.endDate : false,
        isTrialExpired: subscription.trialEndDate ? now > subscription.trialEndDate : false,
        planName: plan.name,
        billingCycle: subscription.billingCycle as 'monthly' | 'yearly',
        trialEndDate: subscription.trialEndDate,
        nextBillingDate: subscription.nextBillingDate,
        limits: {
          maxUsers: plan.maxUsers,
          maxBranches: plan.maxBranches,
          maxProducts: plan.maxProducts,
          maxTransactions: plan.maxTransactions,
        },
        features: {
          enableInventory: plan.enableInventory,
          enableCategories: plan.enableCategories,
          enableDiscounts: plan.enableDiscounts,
          enableLoyaltyProgram: plan.enableLoyaltyProgram,
          enableCustomerManagement: plan.enableCustomerManagement,
          enableBookingScheduling: plan.enableBookingScheduling,
          enableReports: plan.enableReports,
          enableMultiBranch: plan.enableMultiBranch,
          enableHardwareIntegration: plan.enableHardwareIntegration,
          prioritySupport: plan.prioritySupport,
          customIntegrations: plan.customIntegrations,
          dedicatedAccountManager: plan.dedicatedAccountManager,
          enableTableManagement: plan.enableTableManagement ?? false,
        },
        birCompliance: {
          ptuAssistance: plan.birPtuAssistance ?? false,
          receiptFormatting: plan.birReceiptFormatting ?? false,
          birDocumentation: plan.birDocumentation ?? false,
          casReporting: plan.birCasReporting ?? false,
          auditTrailSystem: plan.birAuditTrailSystem ?? false,
          monthlySupport: plan.birMonthlySupport ?? false,
        },
        pharmacyCompliance: {
          enablePharmacyCompliance: plan.pharmacyComplianceEnabled ?? false,
          prescriptionManagement: plan.prescriptionManagement ?? false,
          expiryTracking: plan.expiryTracking ?? false,
          pdeaReporting: (plan as unknown as { pdeaReporting?: boolean }).pdeaReporting ?? false,
        },
        usage: {
          currentUsers: subscription.usageCurrentUsers,
          currentBranches: subscription.usageCurrentBranches,
          currentProducts: subscription.usageCurrentProducts,
          currentTransactions: subscription.usageCurrentTransactions,
        },
      };

      return status;
    } catch (error) {
      logger.error('Error getting subscription status:', error);
      return null;
    }
  }

  /**
   * Check if tenant can perform an action based on subscription limits
   */
  static async checkLimit(
    tenantId: string,
    limitType: keyof SubscriptionLimits,
    currentCount: number
  ): Promise<{ allowed: boolean; limit: number; upgradeRequired: boolean }> {
    const status = await this.getSubscriptionStatus(tenantId);

    if (!status) {
      // No subscription - allow basic usage during trial
      return { allowed: true, limit: 10, upgradeRequired: false };
    }

    if (!status.isActive && !status.isTrial) {
      return { allowed: false, limit: 0, upgradeRequired: true };
    }

    // Only block if the subscription itself is expired, or if still in trial and trial expired
    if (status.isExpired || (status.isTrial && status.isTrialExpired)) {
      return { allowed: false, limit: 0, upgradeRequired: true };
    }

    const limit = status.limits[limitType];

    // -1 means unlimited
    if (limit === -1) {
      return { allowed: true, limit: -1, upgradeRequired: false };
    }

    return {
      allowed: currentCount < limit,
      limit,
      upgradeRequired: currentCount >= limit,
    };
  }

  /**
   * Check if tenant has access to a feature
   */
  static async checkFeature(
    tenantId: string,
    feature: keyof SubscriptionFeatures
  ): Promise<boolean> {
    const status = await this.getSubscriptionStatus(tenantId);

    if (!status) {
      // No subscription - allow basic features during trial
      const basicFeatures: (keyof SubscriptionFeatures)[] = [
        'enableInventory',
        'enableCategories',
        'enableReports'
      ];
      return basicFeatures.includes(feature);
    }

    if (!status.isActive && !status.isTrial) {
      return false;
    }

    // Only block if the subscription itself is expired, or if still in trial and trial expired
    if (status.isExpired || (status.isTrial && status.isTrialExpired)) {
      return false;
    }

    return status.features[feature];
  }

  /**
   * Check if tenant has access to a BIR compliance feature
   */
  static async checkBirFeature(
    tenantId: string,
    feature: keyof BirComplianceFeatures
  ): Promise<boolean> {
    const status = await this.getSubscriptionStatus(tenantId);

    if (!status) {
      // auditTrailSystem is available on all plans including no-subscription trial
      return feature === 'auditTrailSystem';
    }

    if (!status.isActive && !status.isTrial) {
      return false;
    }

    if (status.isExpired || (status.isTrial && status.isTrialExpired)) {
      return false;
    }

    return status.birCompliance[feature];
  }

  /**
   * Check if tenant has access to a pharmacy compliance feature
   */
  static async checkPharmacyFeature(
    tenantId: string,
    feature: keyof PharmacyComplianceFeatures
  ): Promise<boolean> {
    const status = await this.getSubscriptionStatus(tenantId);

    if (!status) {
      return false;
    }

    if (!status.isActive && !status.isTrial) {
      return false;
    }

    if (status.isExpired || (status.isTrial && status.isTrialExpired)) {
      return false;
    }

    return status.pharmacyCompliance[feature];
  }

  /**
   * Update usage counters for a tenant
   */
  static async updateUsage(
    tenantId: string,
    updates: Partial<{
      users: number;
      branches: number;
      products: number;
      transactions: number;
    }>
  ): Promise<void> {
    try {
      const updateObj: Record<string, number> = {};

      if (updates.users !== undefined) {
        updateObj.usageCurrentUsers = updates.users;
      }
      if (updates.branches !== undefined) {
        updateObj.usageCurrentBranches = updates.branches;
      }
      if (updates.products !== undefined) {
        updateObj.usageCurrentProducts = updates.products;
      }
      if (updates.transactions !== undefined) {
        updateObj.usageCurrentTransactions = updates.transactions;
      }

      if (Object.keys(updateObj).length === 0) return;

      // updateMany scoped by tenantId (not update-by-id) so a caller can
      // never accidentally target another tenant's subscription row.
      await prisma.subscription.updateMany({
        where: { tenantId },
        data: updateObj,
      });
    } catch (error) {
      logger.error('Error updating subscription usage:', error);
    }
  }

  /**
   * Get all subscription plans
   */
  static async getPlans(): Promise<SubscriptionPlan[]> {
    try {
      return await prisma.subscriptionPlan.findMany({
        where: { isActive: true },
        orderBy: { priceMonthly: 'asc' },
      });
    } catch (error) {
      logger.error('Error getting subscription plans:', error);
      return [];
    }
  }

  /**
   * Create or update subscription for a tenant
   */
  static async createSubscription(
    tenantId: string,
    planId: string,
    options: {
      isTrial?: boolean;
      billingCycle?: 'monthly' | 'yearly';
      startDate?: Date;
    } = {}
  ): Promise<Subscription> {
    try {
      const { isTrial = true, billingCycle = 'monthly', startDate = new Date() } = options;

      // Check if tenant already has a subscription (scoped by tenantId)
      const existingSubscription = await prisma.subscription.findFirst({
        where: {
          tenantId,
          status: { in: ['active', 'trial'] },
        },
      });

      if (existingSubscription) {
        throw new Error('Tenant already has an active subscription');
      }

      let trialEndDate: Date | undefined;
      let nextBillingDate: Date;

      if (isTrial) {
        trialEndDate = new Date(startDate);
        trialEndDate.setDate(trialEndDate.getDate() + 30);
        nextBillingDate = trialEndDate;
      } else {
        nextBillingDate = new Date(startDate);
        if (billingCycle === 'yearly') {
          nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
        } else {
          nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
        }
      }

      const subscription = await prisma.subscription.create({
        data: {
          id: crypto.randomUUID(),
          tenantId,
          planId,
          status: isTrial ? 'trial' : 'active',
          billingCycle,
          startDate,
          isTrial,
          autoRenew: true,
          usageCurrentUsers: 1,
          usageCurrentBranches: 1,
          usageCurrentProducts: 0,
          usageCurrentTransactions: 0,
          usageLastResetDate: startDate,
          trialEndDate,
          nextBillingDate,
        },
      });

      // Note: unlike the Mongoose model, Tenant has no subscriptionId FK column —
      // the relation is implicit via Subscription.tenantId (@unique), so no
      // separate Tenant update is needed here.
      return subscription;
    } catch (error) {
      logger.error('Error creating subscription:', error);
      throw error;
    }
  }

  /**
   * Ensure a tenant has a trial subscription (idempotent).
   * Returns the existing subscription if one is already active/trial.
   *
   * Accepts an optional `Prisma.TransactionClient` so callers that must
   * guarantee "tenant created ⇒ trial applied" atomically (e.g. self-serve
   * signup) can run this inside the same `$transaction` as tenant/user
   * creation — a failure here then rolls back the whole signup instead of
   * silently leaving a tenant with no subscription.
   */
  static async ensureTrialSubscription(
    tenantId: string,
    client: Prisma.TransactionClient | typeof prisma = prisma
  ): Promise<{
    subscription: Subscription;
    created: boolean;
  }> {
    const existing = await client.subscription.findFirst({
      where: {
        tenantId,
        status: { in: ['active', 'trial'] },
      },
    });

    if (existing) {
      return { subscription: existing, created: false };
    }

    const starterPlan = await client.subscriptionPlan.findFirst({
      where: { tier: 'starter', isActive: true },
    });
    if (!starterPlan) {
      throw new Error('Starter plan not available');
    }

    const now = new Date();
    const trialEndDate = new Date(now);
    trialEndDate.setDate(trialEndDate.getDate() + 14);

    try {
      const subscription = await client.subscription.create({
        data: {
          id: crypto.randomUUID(),
          tenantId,
          planId: starterPlan.id,
          status: 'trial',
          billingCycle: 'monthly',
          startDate: now,
          trialEndDate,
          nextBillingDate: trialEndDate,
          isTrial: true,
          autoRenew: true,
          usageCurrentUsers: 1,
          usageCurrentBranches: 1,
          usageCurrentProducts: 0,
          usageCurrentTransactions: 0,
          usageLastResetDate: now,
        },
      });

      await client.billingEvent.create({
        data: {
          id: crypto.randomUUID(),
          tenantId,
          subscriptionId: subscription.id,
          type: 'trial_started',
          amount: 0,
          currency: 'PHP',
          description: `Trial started for 14 days on ${starterPlan.name} plan`,
        },
      });

      return { subscription, created: true };
    } catch (error: unknown) {
      // Unique constraint violation (tenantId is @unique on Subscription) — a
      // concurrent request already created one for this same tenant. Only
      // relevant outside a transaction (e.g. two racing background jobs on
      // an existing tenant) — inside `$transaction`, a P2002 here aborts the
      // whole transaction and this recovery path never runs.
      if ((error as { code?: string }).code === 'P2002') {
        const raced = await client.subscription.findUnique({ where: { tenantId } });
        if (raced) {
          return { subscription: raced, created: false };
        }
      }
      throw error;
    }
  }
}

/**
 * Middleware function to check subscription limits before allowing actions
 */
export async function checkSubscriptionLimit(
  tenantId: string,
  limitType: keyof SubscriptionLimits,
  currentCount: number
): Promise<void> {
  const result = await SubscriptionService.checkLimit(tenantId, limitType, currentCount);

  if (!result.allowed) {
    if (result.upgradeRequired) {
      throw new Error(`Subscription limit exceeded for ${limitType}. Current: ${currentCount}, Limit: ${result.limit}. Please upgrade your plan.`);
    } else {
      throw new Error(`Action not allowed due to subscription limits.`);
    }
  }
}

/**
 * Middleware function to check feature access
 */
export async function checkFeatureAccess(
  tenantId: string,
  feature: keyof SubscriptionFeatures
): Promise<void> {
  const hasAccess = await SubscriptionService.checkFeature(tenantId, feature);

  if (!hasAccess) {
    throw new Error(`Feature '${feature}' is not available in your current subscription plan. Please upgrade to access this feature.`);
  }
}

/**
 * Middleware function to check BIR compliance feature access
 */
export async function checkBirFeatureAccess(
  tenantId: string,
  feature: keyof BirComplianceFeatures
): Promise<void> {
  const hasAccess = await SubscriptionService.checkBirFeature(tenantId, feature);

  if (!hasAccess) {
    throw new Error(`BIR compliance feature '${feature}' is not available in your current subscription plan. Please upgrade to access this feature.`);
  }
}

/**
 * Middleware function to check pharmacy compliance feature access
 */
export async function checkPharmacyFeatureAccess(
  tenantId: string,
  feature: keyof PharmacyComplianceFeatures
): Promise<void> {
  const hasAccess = await SubscriptionService.checkPharmacyFeature(tenantId, feature);

  if (!hasAccess) {
    throw new Error(`Pharmacy compliance feature '${feature}' is not available in your current subscription plan. Please upgrade to access this feature.`);
  }
}
