import connectDB from '@/lib/mongodb';
import Subscription from '@/models/Subscription';
import SubscriptionPlan from '@/models/SubscriptionPlan';
import Tenant from '@/models/Tenant';
import { logger } from '@/lib/logger';
import { cacheWrap, CacheKeys, TTL } from '@/lib/cache';
import { getTenantSettingsById } from '@/lib/tenant';
import { getTenantMonthRange } from '@/lib/timezone';
import mongoose from 'mongoose'; // eslint-disable-line @typescript-eslint/no-unused-vars

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

/**
 * This calendar month at the store, so the monthly sales counter resets at midnight on the 1st
 * in the tenant's time zone, not the server's (UTC on Vercel, 8 hours late for Manila).
 * Tenant settings are cached, so this adds no database read per sale.
 */
export async function tenantMonthRange(tenantId: string): Promise<{ start: Date; end: Date }> {
  const settings = await getTenantSettingsById(String(tenantId)).catch(() => null);
  return getTenantMonthRange(settings?.timezone || undefined);
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
      await connectDB();

      const subscription = await Subscription.findOne({ tenantId })
        .populate('planId', 'name tier price features birCompliance pharmacyCompliance')
        .lean();

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
        const fallbackPlan = await SubscriptionPlan.findOne({ tier: 'starter', isActive: true }).lean();
        if (fallbackPlan) {
          // Reassign subscription to the current starter plan
          await Subscription.findByIdAndUpdate(subscription._id, { planId: fallbackPlan._id });
          plan = fallbackPlan as PopulatedPlan;
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
    await connectDB();
    const sub = await cacheWrap(`${CacheKeys.subscriptionStatus(String(tenantId))}:usage`, TTL.SHORT, () =>
      Subscription.findOne({ tenantId })
        .select('usage.currentTransactions usage.lastResetDate')
        .lean()
    );
    const lastReset = sub?.usage?.lastResetDate ? new Date(sub.usage.lastResetDate) : null;
    if (!lastReset || lastReset < (await tenantMonthRange(tenantId)).start) return null;
    return sub!.usage.currentTransactions ?? 0;
  }

  /**
   * Record one completed sale against the monthly transaction counter.
   * One $inc write per sale; on the first sale of a new month the counter is
   * re-seeded from a single countDocuments (also covers pre-existing data).
   */
  static async recordTransaction(tenantId: string, countThisMonth: () => Promise<number>): Promise<void> {
    await connectDB();
    const monthStart = (await tenantMonthRange(tenantId)).start;
    const res = await Subscription.updateOne(
      { tenantId, 'usage.lastResetDate': { $gte: monthStart } },
      { $inc: { 'usage.currentTransactions': 1 } }
    );
    if (res.matchedCount === 0) {
      await Subscription.updateOne(
        { tenantId },
        { $set: { 'usage.currentTransactions': await countThisMonth(), 'usage.lastResetDate': new Date() } }
      );
    }
  }

  /** Transactions created so far in the tenant's current calendar month (the one count every caller shares). */
  static async countTransactionsThisMonth(tenantId: string): Promise<number> {
    const { default: Transaction } = await import('@/models/Transaction');
    const { start, end } = await tenantMonthRange(tenantId);
    return Transaction.countDocuments({ tenantId, createdAt: { $gte: start, $lt: end } });
  }

  /**
   * recordTransaction() for any path that creates a Transaction document
   * (manual entry, refunds, offline sync…). Never throws — usage tracking must
   * not fail the request.
   */
  static async trackTransactionCreated(tenantId: string): Promise<void> {
    try {
      await this.recordTransaction(String(tenantId), () => this.countTransactionsThisMonth(String(tenantId)));
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
      await connectDB();

      const updateObj: Record<string, number> = {};

      if (updates.users !== undefined) {
        updateObj['usage.currentUsers'] = updates.users;
      }
      if (updates.branches !== undefined) {
        updateObj['usage.currentBranches'] = updates.branches;
      }
      if (updates.products !== undefined) {
        updateObj['usage.currentProducts'] = updates.products;
      }
      if (updates.transactions !== undefined) {
        updateObj['usage.currentTransactions'] = updates.transactions;
      }

      await Subscription.findOneAndUpdate(
        { tenantId },
        updateObj,
        { upsert: false }
      );
    } catch (error) {
      logger.error('Error updating subscription usage:', error);
    }
  }

  /**
   * Get all subscription plans
   */
  static async getPlans(): Promise<Record<string, unknown>[]> {
    try {
      await connectDB();
      return await SubscriptionPlan.find({ isActive: true }).sort({ 'price.monthly': 1 }).lean();
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
  ): Promise<unknown> {
    try {
      await connectDB();

      const { isTrial = true, billingCycle = 'monthly', startDate = new Date() } = options;

      // Check if tenant already has a subscription
      const existingSubscription = await Subscription.findOne({
        tenantId,
        status: { $in: ['active', 'trial'] }
      });

      if (existingSubscription) {
        throw new Error('Tenant already has an active subscription');
      }

      const subscriptionData: {
        tenantId: string;
        planId: string;
        status: string;
        billingCycle: string;
        startDate: Date;
        isTrial: boolean;
        autoRenew: boolean;
        usage: Record<string, unknown>;
        trialEndDate?: Date;
        nextBillingDate?: Date;
      } = {
        tenantId,
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

      const subscription = await Subscription.create(subscriptionData);

      // Update tenant with subscription reference
      await Tenant.findByIdAndUpdate(tenantId, {
        subscriptionId: subscription._id
      });

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
    subscription: InstanceType<typeof Subscription>;
    created: boolean;
  }> {
    await connectDB();

    const existing = await Subscription.findOne({
      tenantId,
      status: { $in: ['active', 'trial'] },
    });

    if (existing) {
      return { subscription: existing, created: false };
    }

    const starterPlan = await SubscriptionPlan.findOne({ tier: 'starter', isActive: true });
    if (!starterPlan) {
      throw new Error('Starter plan not available');
    }

    const now = new Date();
    const trialEndDate = new Date(now);
    trialEndDate.setDate(trialEndDate.getDate() + 14);

    try {
      const subscription = await Subscription.create({
        tenantId,
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

      await Tenant.findByIdAndUpdate(tenantId, {
        subscriptionId: subscription._id,
      });

      return { subscription, created: true };
    } catch (error: unknown) {
      if ((error as { code?: number }).code === 11000) {
        const raced = await Subscription.findOne({ tenantId });
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