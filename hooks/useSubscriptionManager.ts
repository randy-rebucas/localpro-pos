import { useCallback, useRef, useState } from 'react';

export interface SubscriptionPlan {
  _id: string;
  name: string;
  tier: string;
  description?: string;
  price: {
    monthly: number;
    setupFee?: number;
    currency: string;
  };
  features: {
    maxUsers: number;
    maxBranches: number;
    maxProducts: number;
    maxTransactions: number;
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
  };
  birCompliance?: {
    ptuAssistance: boolean;
    receiptFormatting: boolean;
    birDocumentation: boolean;
    casReporting: boolean;
    auditTrailSystem: boolean;
    monthlySupport: boolean;
  };
  isActive: boolean;
  isCustom: boolean;
}

export interface Subscription {
  _id: string;
  tenantId: {
    _id: string;
    slug: string;
    name: string;
  };
  planId: SubscriptionPlan;
  status: 'active' | 'inactive' | 'cancelled' | 'suspended' | 'trial';
  billingCycle: 'monthly' | 'yearly';
  startDate: string;
  endDate?: string;
  trialEndDate?: string;
  nextBillingDate?: string;
  isTrial: boolean;
  autoRenew: boolean;
  usage: {
    currentUsers: number;
    currentBranches: number;
    currentProducts: number;
    currentTransactions: number;
  };
}

export interface BillingTransaction {
  _id: string;
  amount: number;
  currency: string;
  status: 'paid' | 'failed' | 'pending' | 'refunded';
  date: string;
  transactionId?: string;
  invoiceUrl?: string;
}

export const useSubscriptionManager = () => {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [billingHistory, setBillingHistory] = useState<BillingTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [billingLoading, setBillingLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchSubscription = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    abortControllerRef.current = controller;

    try {
      setLoading(true);
      const res = await fetch('/api/subscriptions/current', { credentials: 'include', signal: controller.signal });
      const data = await res.json();
      if (data.success) {
        setSubscription(data.data);
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Error fetching subscription:', error);
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  const fetchBillingHistory = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    abortControllerRef.current = controller;

    try {
      setBillingLoading(true);
      const res = await fetch('/api/subscriptions/billing-history', { credentials: 'include', signal: controller.signal });
      const data = await res.json();
      if (data.success) {
        setBillingHistory(data.data || []);
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Error fetching billing history:', error);
      }
    } finally {
      clearTimeout(timeoutId);
      setBillingLoading(false);
    }
  }, []);

  return {
    subscription,
    billingHistory,
    loading,
    billingLoading,
    fetchSubscription,
    fetchBillingHistory,
  };
};
