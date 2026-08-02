import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';

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

type PlanFeatures = SubscriptionLimits & SubscriptionFeatures;

export class SubscriptionService {
  /**
   * Get subscription status for a tenant
   */
  static async getSubscriptionStatus(tenantId: string): Promise<SubscriptionStatus | null> {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { tenantId },
        include: { plan: true },
      });

      if (!subscription) {
        return null;
      }

      let plan = subscription.plan;
      const now = new Date();

      // Handle orphaned/missing plan features
      if (!plan || !plan.features || Object.keys(plan.features as object).length === 0) {
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
          const usage = (subscription.usage ?? {}) as Record<string, number>;
          return {
            isActive: subscription.status === 'active',
            isTrial: subscription.isTrial || subscription.status === 'trial',
            isExpired: subscription.endDate ? now > subscription.endDate : false,
            isTrialExpired: subscription.trialEndDate ? now > subscription.trialEndDate : false,
            planName: 'Starter',
            billingCycle: subscription.billingCycle as 'monthly' | 'yearly',
            trialEndDate: subscription.trialEndDate ?? undefined,
            nextBillingDate: subscription.nextBillingDate ?? undefined,
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
              currentUsers: usage.currentUsers ?? 0,
              currentBranches: usage.currentBranches ?? 0,
              currentProducts: usage.currentProducts ?? 0,
              currentTransactions: usage.currentTransactions ?? 0,
            },
          };
        }
      }

      const planFeatures = (plan.features ?? {}) as Partial<PlanFeatures>;
      const birCompliance = (plan.birCompliance ?? {}) as Partial<BirComplianceFeatures>;
      const pharmacyCompliance = (plan.pharmacyCompliance ?? {}) as Partial<PharmacyComplianceFeatures>;
      const usage = (subscription.usage ?? {}) as Record<string, number>;

      const status: SubscriptionStatus = {
        isActive: subscription.status === 'active',
        isTrial: subscription.isTrial,
        isExpired: subscription.endDate ? now > subscription.endDate : false,
        isTrialExpired: subscription.trialEndDate ? now > subscription.trialEndDate : false,
        planName: plan.name,
        billingCycle: subscription.billingCycle as 'monthly' | 'yearly',
        trialEndDate: subscription.trialEndDate ?? undefined,
        nextBillingDate: subscription.nextBillingDate ?? undefined,
        limits: {
          maxUsers: planFeatures.maxUsers as number,
          maxBranches: planFeatures.maxBranches as number,
          maxProducts: planFeatures.maxProducts as number,
          maxTransactions: planFeatures.maxTransactions as number,
        },
        features: {
          enableInventory: planFeatures.enableInventory as boolean,
          enableCategories: planFeatures.enableCategories as boolean,
          enableDiscounts: planFeatures.enableDiscounts as boolean,
          enableLoyaltyProgram: planFeatures.enableLoyaltyProgram as boolean,
          enableCustomerManagement: planFeatures.enableCustomerManagement as boolean,
          enableBookingScheduling: planFeatures.enableBookingScheduling as boolean,
          enableReports: planFeatures.enableReports as boolean,
          enableMultiBranch: planFeatures.enableMultiBranch as boolean,
          enableHardwareIntegration: planFeatures.enableHardwareIntegration as boolean,
          prioritySupport: planFeatures.prioritySupport as boolean,
          customIntegrations: planFeatures.customIntegrations as boolean,
          dedicatedAccountManager: planFeatures.dedicatedAccountManager as boolean,
          enableTableManagement: planFeatures.enableTableManagement ?? false,
        },
        birCompliance: {
          ptuAssistance: birCompliance.ptuAssistance ?? false,
          receiptFormatting: birCompliance.receiptFormatting ?? false,
          birDocumentation: birCompliance.birDocumentation ?? false,
          casReporting: birCompliance.casReporting ?? false,
          auditTrailSystem: birCompliance.auditTrailSystem ?? false,
          monthlySupport: birCompliance.monthlySupport ?? false,
        },
        pharmacyCompliance: {
          enablePharmacyCompliance: pharmacyCompliance.enablePharmacyCompliance ?? false,
          prescriptionManagement: pharmacyCompliance.prescriptionManagement ?? false,
          expiryTracking: pharmacyCompliance.expiryTracking ?? false,
          pdeaReporting: pharmacyCompliance.pdeaReporting ?? false,
        },
        usage: {
          currentUsers: usage.currentUsers ?? 0,
          currentBranches: usage.currentBranches ?? 0,
          currentProducts: usage.currentProducts ?? 0,
          currentTransactions: usage.currentTransactions ?? 0,
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
      const existing = await prisma.subscription.findUnique({
        where: { tenantId },
        select: { usage: true },
      });

      if (!existing) {
        return;
      }

      const currentUsage = (existing.usage ?? {}) as Record<string, unknown>;
      const nextUsage: Record<string, unknown> = { ...currentUsage };

      if (updates.users !== undefined) {
        nextUsage.currentUsers = updates.users;
      }
      if (updates.branches !== undefined) {
        nextUsage.currentBranches = updates.branches;
      }
      if (updates.products !== undefined) {
        nextUsage.currentProducts = updates.products;
      }
      if (updates.transactions !== undefined) {
        nextUsage.currentTransactions = updates.transactions;
      }

      await prisma.subscription.update({
        where: { tenantId },
        data: { usage: nextUsage as object },
      });
    } catch (error) {
      logger.error('Error updating subscription usage:', error);
    }
  }

  /**
   * Get all subscription plans
   */
  static async getPlans(): Promise<Record<string, unknown>[]> {
    try {
      const plans = await prisma.subscriptionPlan.findMany({
        where: { isActive: true },
        orderBy: { priceMonthly: 'asc' },
      });
      return plans as unknown as Record<string, unknown>[];
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
      const { isTrial = true, billingCycle = 'monthly', startDate = new Date() } = options;

      // Check if tenant already has a subscription
      const existingSubscription = await prisma.subscription.findFirst({
        where: {
          tenantId,
          status: { in: ['active', 'trial'] },
        },
      });

      if (existingSubscription) {
        throw new Error('Tenant already has an active subscription');
      }

      const usage = {
        currentUsers: 1,
        currentBranches: 1,
        currentProducts: 0,
        currentTransactions: 0,
        lastResetDate: startDate,
      };

      let trialEndDate: Date | undefined;
      let nextBillingDate: Date | undefined;

      // Set trial/billing dates
      if (isTrial) {
        trialEndDate = new Date(startDate);
        trialEndDate.setDate(trialEndDate.getDate() + 30);
        nextBillingDate = trialEndDate;
      } else {
        const nextBilling = new Date(startDate);
        if (billingCycle === 'yearly') {
          nextBilling.setFullYear(nextBilling.getFullYear() + 1);
        } else {
          nextBilling.setMonth(nextBilling.getMonth() + 1);
        }
        nextBillingDate = nextBilling;
      }

      const subscription = await prisma.subscription.create({
        data: {
          tenantId,
          planId,
          status: isTrial ? 'trial' : 'active',
          billingCycle,
          startDate,
          isTrial,
          autoRenew: true,
          usage,
          trialEndDate,
          nextBillingDate,
        },
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
    subscription: Awaited<ReturnType<typeof prisma.subscription.findUniqueOrThrow>>;
    created: boolean;
  }> {
    const existing = await prisma.subscription.findFirst({
      where: {
        tenantId,
        status: { in: ['active', 'trial'] },
      },
    });

    if (existing) {
      return { subscription: existing, created: false };
    }

    const starterPlan = await prisma.subscriptionPlan.findFirst({
      where: { tier: 'starter', isActive: true },
    });
    if (!starterPlan) {
      throw new Error('Starter plan not available');
    }

    const now = new Date();
    const trialEndDate = new Date(now);
    trialEndDate.setDate(trialEndDate.getDate() + 14);

    try {
      const subscription = await prisma.subscription.create({
        data: {
          tenantId,
          planId: starterPlan.id,
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
        },
      });

      return { subscription, created: true };
    } catch (error: unknown) {
      // Unique constraint violation (tenantId is unique) — another request raced us.
      if ((error as { code?: string }).code === 'P2002') {
        const raced = await prisma.subscription.findUnique({ where: { tenantId } });
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
