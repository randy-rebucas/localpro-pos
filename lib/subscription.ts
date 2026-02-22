import connectDB from '@/lib/mongodb';
import Subscription from '@/models/Subscription';
import SubscriptionPlan from '@/models/SubscriptionPlan';
import Tenant from '@/models/Tenant';
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
  enableReports: boolean;
  enableMultiBranch: boolean;
  enableHardwareIntegration: boolean;
  prioritySupport: boolean;
  customIntegrations: boolean;
  dedicatedAccountManager: boolean;
}

export interface SubscriptionStatus {
  isActive: boolean;
  isTrial: boolean;
  isExpired: boolean;
  isTrialExpired: boolean;
  planName: string;
  limits: SubscriptionLimits;
  features: SubscriptionFeatures;
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

export class SubscriptionService {
  /**
   * Get subscription status for a tenant
   */
  static async getSubscriptionStatus(tenantId: string): Promise<SubscriptionStatus | null> {
    try {
      await connectDB();

      const subscription = await Subscription.findOne({ tenantId })
        .populate('planId', 'name tier price features')
        .lean();

      if (!subscription) {
        return null;
      }

      const plan = subscription.planId as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      const now = new Date();

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
        },
        usage: subscription.usage,
      };

      return status;
    } catch (error) {
      console.error('Error getting subscription status:', error);
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

    if (status.isExpired || status.isTrialExpired) {
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

    if (status.isExpired || status.isTrialExpired) {
      return false;
    }

    return status.features[feature];
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

      const updateObj: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any

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
      console.error('Error updating subscription usage:', error);
    }
  }

  /**
   * Get all subscription plans
   */
  static async getPlans(): Promise<any[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      await connectDB();
      return await SubscriptionPlan.find({ isActive: true }).sort({ 'price.monthly': 1 }).lean();
    } catch (error) {
      console.error('Error getting subscription plans:', error);
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
  ): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
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

      const subscriptionData: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
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
      console.error('Error creating subscription:', error);
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