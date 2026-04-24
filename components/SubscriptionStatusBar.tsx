'use client';

import { useSubscription } from '@/contexts/SubscriptionContext';
import { AlertTriangle, CheckCircle, Clock, XCircle, Crown } from 'lucide-react'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';

export function SubscriptionStatusBar() {
  const { subscriptionStatus, loading } = useSubscription();
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  useEffect(() => {
    const l = (lang as 'en' | 'es') || 'en';
    getDictionaryClient(l).then(setDict);
  }, [lang]);

  if (loading) {
    return (
      <div className="bg-brand-soft border-b border-teal-200 px-4 py-3">
        <div className="w-full flex items-center justify-between">
          <div className="animate-pulse flex items-center space-x-3">
            <div className="w-5 h-5 bg-teal-200 rounded"></div>
            <div className="h-4 bg-teal-200 rounded w-48"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!subscriptionStatus) {
    return (
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-800">{dict?.admin?.noActiveSubscription || 'No Active Subscription'}</p>
              <p className="text-xs text-amber-700">{dict?.admin?.noActiveSubscriptionFeatures || 'Some features may be limited'}</p>
            </div>
          </div>
          <Link href={`/${tenant}/${lang}/admin/subscriptions`}>
            <button className="px-3 py-1 text-sm font-medium border border-amber-300 text-amber-700 rounded hover:bg-amber-50">
              {dict?.admin?.viewPlans || 'View Plans'}
            </button>
          </Link>
        </div>
      </div>
    );
  }

  const getStatusConfig = () => {
    if (subscriptionStatus.isTrial && subscriptionStatus.isTrialExpired) {
      return {
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        icon: <XCircle className="w-5 h-5 text-red-600" />,
        title: dict?.admin?.trialExpired || 'Trial Expired',
        description: dict?.admin?.trialExpiredDesc || 'Your trial has ended. Upgrade to continue using all features.',
        badge: <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">{dict?.admin?.expired || 'Expired'}</span>,
        action: dict?.admin?.upgradeNow || 'Upgrade Now',
        actionVariant: 'default' as const,
      };
    }

    if (subscriptionStatus.isExpired) {
      return {
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        icon: <XCircle className="w-5 h-5 text-red-600" />,
        title: dict?.admin?.subscriptionExpired || 'Subscription Expired',
        description: dict?.admin?.subscriptionExpiredDesc || 'Your subscription has expired. Renew to continue using all features.',
        badge: <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">{dict?.admin?.expired || 'Expired'}</span>,
        action: dict?.admin?.renewNow || 'Renew Now',
        actionVariant: 'default' as const,
      };
    }

    if (subscriptionStatus.isTrial && !subscriptionStatus.isTrialExpired) {
      const trialEndDate = subscriptionStatus.trialEndDate ? new Date(subscriptionStatus.trialEndDate) : null;
      const daysLeft = trialEndDate
        ? Math.ceil((trialEndDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      return {
        bgColor: 'bg-brand-soft',
        borderColor: 'border-teal-200',
        icon: <Clock className="w-5 h-5 text-brand" />,
        title: dict?.admin?.trialPeriod || 'Trial Period',
        description: (dict?.admin?.daysRemaining || '{days} days remaining in your trial.').replace('{days}', String(Math.max(0, daysLeft))),
        badge: <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-soft text-brand-navy">{dict?.admin?.trial || 'Trial'}</span>,
        action: dict?.admin?.upgradeNow || 'Upgrade Now',
        actionVariant: 'outline' as const,
      };
    }

    if (!subscriptionStatus.isActive) {
      return {
        bgColor: 'bg-amber-50',
        borderColor: 'border-amber-200',
        icon: <AlertTriangle className="w-5 h-5 text-amber-600" />,
        title: dict?.admin?.subscriptionInactive || 'Subscription Inactive',
        description: dict?.admin?.subscriptionInactiveDesc || 'Your subscription is currently inactive.',
        badge: <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-300">{dict?.admin?.inactive || 'Inactive'}</span>,
        action: dict?.admin?.reactivate || 'Reactivate',
        actionVariant: 'outline' as const,
      };
    }

    // Active subscription
    return {
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      icon: <CheckCircle className="w-5 h-5 text-green-600" />,
      title: (dict?.admin?.activePlan || 'Active: {plan} Plan').replace('{plan}', subscriptionStatus.planName || ''),
      description: subscriptionStatus.nextBillingDate
        ? (dict?.admin?.nextBilling || 'Next billing: {date}').replace('{date}', new Date(subscriptionStatus.nextBillingDate).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }))
        : (dict?.admin?.subscriptionActive || 'Subscription active'),
      badge: <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">{dict?.admin?.active || 'Active'}</span>,
      action: dict?.admin?.manage || 'Manage',
      actionVariant: 'outline' as const,
    };
  };

  const config = getStatusConfig();

  return (
    <div className={`${config.bgColor} border-b ${config.borderColor} px-4 py-3`}>
      <div className="w-full flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {config.icon}
          <div>
            <div className="flex items-center space-x-2">
              <p className="text-sm font-medium text-gray-800">{config.title}</p>
              {config.badge}
            </div>
            <p className="text-xs text-gray-600">{config.description}</p>
          </div>
        </div>
        <Link href={`/${tenant}/${lang}/admin/subscriptions`}>
          <button className={`px-3 py-1 rounded text-sm font-medium ${
            config.actionVariant === 'default'
              ? 'bg-brand text-white hover:bg-brand-hover'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}>
            {config.action}
          </button>
        </Link>
      </div>
    </div>
  );
}