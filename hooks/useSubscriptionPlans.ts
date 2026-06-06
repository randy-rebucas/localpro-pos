'use client';

import { useCallback, useEffect, useState } from 'react';

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

export type SubscriptionStatus = 'loading' | 'ready' | 'error';

export function useSubscriptionPlans() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [currentPlanName, setCurrentPlanName] = useState<string | null>(null);
  const [status, setStatus] = useState<SubscriptionStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const [plansRes, statusRes] = await Promise.all([
        fetch('/api/subscription-plans'),
        fetch('/api/subscription/status', { credentials: 'include' }),
      ]);
      const plansResult = await plansRes.json();
      if (!plansResult.success) {
        setPlans([]);
        setError(plansResult.error || 'Failed to load subscription plans');
        setStatus('error');
        return;
      }
      setPlans(plansResult.data || []);
      if (statusRes.ok) {
        const statusResult = await statusRes.json();
        if (statusResult.success && statusResult.data?.planName) {
          setCurrentPlanName(statusResult.data.planName);
        } else {
          setCurrentPlanName(null);
        }
      }
      setStatus('ready');
    } catch (err) {
      console.error('Failed to load subscription plans:', err);
      setPlans([]);
      setError('Failed to load subscription plans');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { plans, currentPlanName, status, error, refetch };
}
