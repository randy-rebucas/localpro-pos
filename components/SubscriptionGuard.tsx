'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';

interface SubscriptionGuardProps {
  children: ReactNode;
}

export function SubscriptionGuard({ children }: SubscriptionGuardProps) {
  const { subscriptionStatus, loading, refreshSubscription } = useSubscription();
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;
  const [isCreatingTrial, setIsCreatingTrial] = useState(false);
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const trialSetupStarted = useRef(false);

  useEffect(() => {
    const l = (lang as 'en' | 'es') || 'en';
    getDictionaryClient(l).then(setDict);
  }, [lang]);

  useEffect(() => {
    const handleSubscriptionCheck = async () => {
      // super_admin has no tenant — subscription check does not apply
      if (user?.role === 'super_admin') return;

      // If still loading, wait
      if (loading) return;

      // If no subscription exists, try to create a trial (once per mount)
      if (!subscriptionStatus) {
        if (trialSetupStarted.current) return;
        trialSetupStarted.current = true;
        setIsCreatingTrial(true);
        try {
          await ensureTrialSubscription();
        } catch (error: unknown) {
          console.error('Failed to create trial subscription:', error);
          trialSetupStarted.current = false;
          router.push(`/${tenant}/${lang}/subscription`);
          setIsCreatingTrial(false);
          return;
        }
        await refreshSubscription();
        setIsCreatingTrial(false);
        return;
      }

      // Reset so a future null status (e.g. tenant switch) can retry setup
      trialSetupStarted.current = false;

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriptionStatus, loading, tenant, lang, router, refreshSubscription, user?.role]);

  const ensureTrialSubscription = async () => {
    const response = await fetch('/api/subscriptions/create-trial', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Failed to create trial subscription');
    }
  };

  // super_admin bypasses subscription entirely
  if (user?.role === 'super_admin') return <>{children}</>;

  // Show loading while checking/creating subscription
  if (loading || isCreatingTrial) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">
            {isCreatingTrial ? (dict?.admin?.settingUpTrial || 'Setting up your trial...') : (dict?.admin?.checkingSubscription || 'Checking subscription...')}
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
          <p className="text-gray-600">{dict?.admin?.preparingAccount || 'Preparing your account...'}</p>
        </div>
      </div>
    );
  }

  // Allow access if we have a valid subscription
  return <>{children}</>;
}
