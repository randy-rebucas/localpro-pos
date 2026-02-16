'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { SubscriptionService } from '@/lib/subscription';
import { Loader2 } from 'lucide-react';

interface SubscriptionGuardProps {
  children: ReactNode;
}

export function SubscriptionGuard({ children }: SubscriptionGuardProps) {
  const { subscriptionStatus, loading, refreshSubscription } = useSubscription();
  const router = useRouter();
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;
  const [isCreatingTrial, setIsCreatingTrial] = useState(false);

  useEffect(() => {
    const handleSubscriptionCheck = async () => {
      // If still loading, wait
      if (loading) return;

      // If no subscription exists, create a trial
      if (!subscriptionStatus) {
        setIsCreatingTrial(true);
        try {
          await createTrialSubscription();
          await refreshSubscription();
        } catch (error) {
          console.error('Failed to create trial subscription:', error);
          // Redirect to subscription page if trial creation fails
          router.push(`/${tenant}/${lang}/subscription`);
        } finally {
          setIsCreatingTrial(false);
        }
        return;
      }

      // If trial has expired, redirect to subscription page
      if (subscriptionStatus.isTrial && subscriptionStatus.isTrialExpired) {
        router.push(`/${tenant}/${lang}/subscription`);
        return;
      }

      // If subscription is not active and not in trial, redirect
      if (!subscriptionStatus.isActive && !subscriptionStatus.isTrial) {
        router.push(`/${tenant}/${lang}/subscription`);
        return;
      }

      // Allow access if subscription is active or trial is active
    };

    handleSubscriptionCheck();
  }, [subscriptionStatus, loading, tenant, lang, router, refreshSubscription]);

  const createTrialSubscription = async () => {
    try {
      // Get the tenant ID from the params (this is the tenant slug)
      const tenantSlug = tenant;

      // We need to get the actual tenant ID from the database
      // Since we can't directly query mongoose in client components,
      // we'll use the API to create the trial subscription
      const response = await fetch('/api/subscriptions/create-trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantSlug }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to create trial subscription');
      }

    } catch (error) {
      console.error('Error creating trial subscription:', error);
      throw error;
    }
  };

  // Show loading while checking/creating subscription
  if (loading || isCreatingTrial) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">
            {isCreatingTrial ? 'Setting up your trial...' : 'Checking subscription...'}
          </p>
        </div>
      </div>
    );
  }

  // If no subscription and not creating trial, show loading
  if (!subscriptionStatus && !isCreatingTrial) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Preparing your account...</p>
        </div>
      </div>
    );
  }

  // Allow access if we have a valid subscription
  return <>{children}</>;
}