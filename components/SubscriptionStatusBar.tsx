'use client';

import { useSubscription } from '@/contexts/SubscriptionContext';
import { AlertTriangle, CheckCircle, Clock, XCircle, Crown } from 'lucide-react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

export function SubscriptionStatusBar() {
  const { subscriptionStatus, loading } = useSubscription();
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;

  if (loading) {
    return (
      <div className="bg-blue-50 border-b border-blue-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center">
          <div className="animate-pulse flex items-center space-x-3">
            <div className="w-5 h-5 bg-blue-300 rounded"></div>
            <div className="h-4 bg-blue-300 rounded w-48"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!subscriptionStatus) {
    return (
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-800">No Active Subscription</p>
              <p className="text-xs text-amber-700">Some features may be limited</p>
            </div>
          </div>
          <Link href={`/${tenant}/${lang}/admin/subscriptions`}>
            <button className="px-3 py-1 text-sm font-medium border border-amber-300 text-amber-700 rounded hover:bg-amber-50">
              View Plans
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
        title: 'Trial Expired',
        description: 'Your trial has ended. Upgrade to continue using all features.',
        badge: <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Expired</span>,
        action: 'Upgrade Now',
        actionVariant: 'default' as const,
      };
    }

    if (subscriptionStatus.isExpired) {
      return {
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        icon: <XCircle className="w-5 h-5 text-red-600" />,
        title: 'Subscription Expired',
        description: 'Your subscription has expired. Renew to continue using all features.',
        badge: <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Expired</span>,
        action: 'Renew Now',
        actionVariant: 'default' as const,
      };
    }

    if (subscriptionStatus.isTrial && !subscriptionStatus.isTrialExpired) {
      const daysLeft = Math.ceil((subscriptionStatus.trialEndDate!.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      return {
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        icon: <Clock className="w-5 h-5 text-blue-600" />,
        title: 'Trial Period',
        description: `${daysLeft} days remaining in your trial.`,
        badge: <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Trial</span>,
        action: 'Upgrade Now',
        actionVariant: 'outline' as const,
      };
    }

    if (!subscriptionStatus.isActive) {
      return {
        bgColor: 'bg-amber-50',
        borderColor: 'border-amber-200',
        icon: <AlertTriangle className="w-5 h-5 text-amber-600" />,
        title: 'Subscription Inactive',
        description: 'Your subscription is currently inactive.',
        badge: <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-300">Inactive</span>,
        action: 'Reactivate',
        actionVariant: 'outline' as const,
      };
    }

    // Active subscription
    return {
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      icon: <CheckCircle className="w-5 h-5 text-green-600" />,
      title: `Active: ${subscriptionStatus.planName} Plan`,
      description: subscriptionStatus.nextBillingDate
        ? `Next billing: ${subscriptionStatus.nextBillingDate.toLocaleDateString()}`
        : 'Subscription active',
      badge: <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Active</span>,
      action: 'Manage',
      actionVariant: 'outline' as const,
    };
  };

  const config = getStatusConfig();

  return (
    <div className={`${config.bgColor} border-b ${config.borderColor} px-4 py-3`}>
      <div className="max-w-7xl mx-auto flex items-center justify-between">
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
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}>
            {config.action}
          </button>
        </Link>
      </div>
    </div>
  );
}