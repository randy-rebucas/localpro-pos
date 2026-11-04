import {
  getRepos,
  isDuplicateKeyError,
  type Subscription,
  type SubscriptionInput,
  type SubscriptionPlan,
} from '@/lib/db';
import { logger } from '@/lib/logger';
import { cacheWrap, CacheKeys, TTL } from '@/lib/cache';

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
  trialEndDate?: Date;
  nextBillingDate?: Date;
}

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export class SubscriptionService {
  /**
   * Get subscription status for a tenant.
   * Every feature/limit check calls this, so the result is cached for 60s per
   * instance and invalidated on Subscription/SubscriptionPlan writes (see models).
   * The returned object is shared — treat it as read-only.
   */
  static async getSubscriptionStatus(tenantId: string): Promise<SubscriptionStatus | null> {
    try {
      return await cacheWrap(CacheKeys.subscriptionStatus(String(tenantId)), TTL.DEFAULT, () =>
        this.loadSubscriptionStatus(tenantId)
      );
    } catch (error) {
      logger.error('Error getting subscription status:', error);
      return null;
    }
  }

  private static async loadSubscriptionStatus(tenantId: string): Promise<SubscriptionStatus | null> {
    {
      const { subscriptions, subscriptionPlans } = getRepos();
      const subscription = await subscriptions.findByTenant(tenantId, {
        populate: { plan: 'name tier price features birCompliance pharmacyCompliance' },
      });

      if (!subscription) {
        return null;
      }

      type PopulatedPlan = {
        name: string;
        features: SubscriptionLimits & SubscriptionFeatures;
        birCompliance?: BirComplianceFeatures;
      };
      let plan = subscription.planId as unknown as PopulatedPlan | null;
      const now = new Date();

      // Handle orphaned planId (plan was deleted/recreated)
      if (!plan || !plan.features) {
        const fallbackPlan = await subscriptionPlans.findByTier('starter', { activeOnly: true });
        if (fallbackPlan) {
          // Reassign subscription to the current starter plan
          await subscriptions.update(tenantId, subscription._id, { set: { planId: fallbackPlan._id } });
          plan = fallbackPlan;
        } else {
          // Subscription exists but plan data is unavailable — return a safe fallback
          // so onboarding is not blocked by a null status.
          logger.warn('Subscription has missing plan; using fallback status', { tenantId });
          const now = new Date();
          return {
            isActive: subscription.status === 'active',
            isTrial: subscription.isTrial || subscription.status === 'trial',
            isExpired: subscription.endDate ? now > subscription.endDate : false,
            isTrialExpired: subscription.trialEndDate ? now > subscription.trialEndDate : false,
            planName: 'Starter',
            billingCycle: subscription.billingCycle,
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
            usage: subscription.usage,
          };
        }
      }

      const status: SubscriptionStatus = {
        isActive: subscription.status === 'active',
        isTrial: subscription.isTrial,
        isExpired: subscription.endDate ? now > subscription.endDate : false,
        isTrialExpired: subscription.trialEndDate ? now > subscription.trialEndDate : false,
        planName: plan.name,
        billingCycle: subscription.billingCycle,
        trialEndDate: subscription.trialEndDate,
        nextBillingDate: subscription.nextBillingDate,
        limits: {
          maxUsers: plan.features.maxUsers,
          maxBranches: plan.features.maxBranches,
          maxProducts: plan.features.maxProducts,
          maxTransactions: plan.features.maxTransactions,
        },
        features: {
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
          enableTableManagement: plan.features.enableTableManagement ?? false,
        },
        birCompliance: {
          ptuAssistance: plan.birCompliance?.ptuAssistance ?? false,
          receiptFormatting: plan.birCompliance?.receiptFormatting ?? false,
          birDocumentation: plan.birCompliance?.birDocumentation ?? false,
          casReporting: plan.birCompliance?.casReporting ?? false,
          auditTrailSystem: plan.birCompliance?.auditTrailSystem ?? false,
          monthlySupport: plan.birCompliance?.monthlySupport ?? false,
        },
        pharmacyCompliance: {
          enablePharmacyCompliance: (plan as any).pharmacyCompliance?.enablePharmacyCompliance ?? false, // eslint-disable-line @typescript-eslint/no-explicit-any
          prescriptionManagement: (plan as any).pharmacyCompliance?.prescriptionManagement ?? false, // eslint-disable-line @typescript-eslint/no-explicit-any
          expiryTracking: (plan as any).pharmacyCompliance?.expiryTracking ?? false, // eslint-disable-line @typescript-eslint/no-explicit-any
          pdeaReporting: (plan as any).pharmacyCompliance?.pdeaReporting ?? false, // eslint-disable-line @typescript-eslint/no-explicit-any
        },
        usage: subscription.usage,
      };

      return status;
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
   * Transactions so far this calendar month, from the cached subscription
   * status — replaces a countDocuments over the month's transactions on every
   * sale. Returns null when the counter hasn't been seeded for this month yet.
   */
  static async getMonthlyTransactionCount(tenantId: string): Promise<number | null> {
    const usage = await cacheWrap(`${CacheKeys.subscriptionStatus(String(tenantId))}:usage`, TTL.SHORT, () =>
      getRepos().subscriptions.findUsage(String(tenantId))
    );
    const lastReset = usage?.lastResetDate ? new Date(usage.lastResetDate) : null;
    if (!lastReset || lastReset < startOfMonth()) return null;
    return usage!.currentTransactions ?? 0;
  }

  /**
   * Record one completed sale against the monthly transaction counter.
   * One $inc write per sale; on the first sale of a new month the counter is
   * re-seeded from a single countDocuments (also covers pre-existing data).
   */
  static async recordTransaction(tenantId: string, countThisMonth: () => Promise<number>): Promise<void> {
    const { subscriptions } = getRepos();
    const counted = await subscriptions.incrementTransactionsSince(tenantId, startOfMonth());
    if (!counted) {
      await subscriptions.setUsage(tenantId, { currentTransactions: await countThisMonth(), lastResetDate: new Date() });
    }
  }

  /**
   * recordTransaction() for any path that creates a Transaction document
   * (manual entry, refunds, offline sync…). Never throws — usage tracking must
   * not fail the request.
   */
  static async trackTransactionCreated(tenantId: string): Promise<void> {
    try {
      await this.recordTransaction(String(tenantId), () => {
        const now = new Date();
        return getRepos().transactions.count(tenantId, {
          createdAt: {
            gte: new Date(now.getFullYear(), now.getMonth(), 1),
            lt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
          },
        });
      });
    } catch (error) {
      logger.error('Failed to update subscription usage:', error);
    }
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
      await getRepos().subscriptions.setUsage(tenantId, {
        currentUsers: updates.users,
        currentBranches: updates.branches,
        currentProducts: updates.products,
        currentTransactions: updates.transactions,
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
      return await getRepos().subscriptionPlans.list({ activeOnly: true });
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

      // Check if tenant already has a subscription
      const existingSubscription = await getRepos().subscriptions.findByTenant(tenantId, { status: ['active', 'trial'] });

      if (existingSubscription) {
        throw new Error('Tenant already has an active subscription');
      }

      const subscriptionData: SubscriptionInput = {
        planId,
        status: isTrial ? 'trial' : 'active',
        billingCycle,
        startDate,
        isTrial,
        autoRenew: true,
        usage: {
          currentUsers: 1,
          currentBranches: 1,
          currentProducts: 0,
          currentTransactions: 0,
          lastResetDate: startDate,
        },
      };

      // Set trial/billing dates
      if (isTrial) {
        const trialEndDate = new Date(startDate);
        trialEndDate.setDate(trialEndDate.getDate() + 30);
        subscriptionData.trialEndDate = trialEndDate;
        subscriptionData.nextBillingDate = trialEndDate;
      } else {
        const nextBilling = new Date(startDate);
        if (billingCycle === 'yearly') {
          nextBilling.setFullYear(nextBilling.getFullYear() + 1);
        } else {
          nextBilling.setMonth(nextBilling.getMonth() + 1);
        }
        subscriptionData.nextBillingDate = nextBilling;
      }

      const subscription = await getRepos().subscriptions.create(tenantId, subscriptionData);

      // No tenant backref write: models/Tenant.ts has no subscriptionId path,
      // so the former Tenant.findByIdAndUpdate(tenantId, { subscriptionId })
      // was stripped by Mongoose strict mode and never stored anything.

      return subscription;
    } catch (error) {
      logger.error('Error creating subscription:', error);
      throw error;
    }
  }

  /**
   * Ensure a tenant has a trial subscription (idempotent).
   * Returns the existing subscription if one is already active/trial.
   */
  static async ensureTrialSubscription(tenantId: string): Promise<{
    subscription: Subscription;
    created: boolean;
  }> {
    const { subscriptions, subscriptionPlans } = getRepos();
    const existing = await subscriptions.findByTenant(tenantId, { status: ['active', 'trial'] });

    if (existing) {
      return { subscription: existing as Subscription, created: false };
    }

    const starterPlan = await subscriptionPlans.findByTier('starter', { activeOnly: true });
    if (!starterPlan) {
      throw new Error('Starter plan not available');
    }

    const now = new Date();
    const trialEndDate = new Date(now);
    trialEndDate.setDate(trialEndDate.getDate() + 14);

    try {
      const subscription = await subscriptions.create(tenantId, {
        planId: starterPlan._id,
        status: 'trial',
        billingCycle: 'monthly',
        startDate: now,
        trialEndDate,
        nextBillingDate: trialEndDate,
        isTrial: true,
        autoRenew: true,
        usage: {
          currentUsers: 1,
          currentBranches: 1,
          currentProducts: 0,
          currentTransactions: 0,
          lastResetDate: now,
        },
      });

      // No tenant backref write: models/Tenant.ts has no subscriptionId path,
      // so the former Tenant.findByIdAndUpdate(tenantId, { subscriptionId })
      // was stripped by Mongoose strict mode and never stored anything.

      return { subscription, created: true };
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) {
        const raced = await subscriptions.findByTenant(tenantId);
        if (raced) {
          return { subscription: raced as Subscription, created: false };

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