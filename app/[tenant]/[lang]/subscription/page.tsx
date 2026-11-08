'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check } from 'lucide-react';
import '@/app/marketing.css';
import { marketingFontClasses } from '@/components/marketing/fonts';
import { LineTag, ReceiptRow } from '@/components/marketing/primitives';
import { getDictionaryClient } from '../dictionaries-client';
import { showToast } from '@/lib/toast';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import Navbar from '@/components/Navbar';
import PageTitle from '@/components/PageTitle';
import StatusSlip, { slipSecondaryKey } from '@/components/StatusSlip';
import ErrorState from '@/components/ui/ErrorState';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import SubscriptionPlansSkeleton from '@/components/subscription/SubscriptionPlansSkeleton';
import { STORED_CHECKOUT_KEY } from '@/components/subscription/storedCheckout';
import { useSubscriptionPlans } from '@/hooks/useSubscriptionPlans';
import { usePermissions } from '@/hooks/usePermissions';
import type { TranslationDict } from '@/types/dictionary';

type BillingCycle = 'monthly' | 'yearly';

const KEY = 'flex min-h-[44px] w-full items-center justify-center gap-2 px-4 font-receipt text-xs font-medium uppercase transition-colors touch-manipulation disabled:cursor-not-allowed disabled:opacity-50';
const PRIMARY_KEY = `${KEY} bg-ink text-paper-white hover:bg-brand-navy`;
const SECONDARY_KEY = `${KEY} border border-ink/25 text-ink hover:border-ink`;
const FEATURE = 'flex items-start gap-2 text-sm';

function Feature({ children }: { children: ReactNode }) {
  return (
    <li className={FEATURE}>
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-hover" strokeWidth={1.75} aria-hidden />
      <span>{children}</span>
    </li>
  );
}

function SubscriptionShell({ tag, title, subtitle, back, children }: {
  tag?: string;
  title: string;
  subtitle: string;
  back: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`${marketingFontClasses} mk-root pos-register flex min-h-dvh flex-col`}>
      <PageTitle />
      <Navbar />
      <div className="flex-1 bg-brand-navy-deep text-paper">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
          {back}
          {tag && <LineTag no="SUB" className="mb-3 mt-4 text-[#8fe3d0]">{tag}</LineTag>}
          <h1 className="text-5xl text-paper-white sm:text-6xl lg:text-7xl">{title}</h1>
          <p className="mt-3 text-paper/70">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function SubscriptionPage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const { plans, currentPlanName, status, error, refetch } = useSubscriptionPlans();
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [upgrading, setUpgrading] = useState<BillingCycle | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponApplying, setCouponApplying] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    appliesTo: 'all_plans' | 'specific_plans';
    planIds: string[];
  } | null>(null);
  const { settings } = useTenantSettings();
  const { canAccess } = usePermissions();
  const canManageSubscription = canAccess('subscriptions.manage');

  const currentPlan = plans.find((p) => p.name === currentPlanName);
  const currentPlanId = currentPlan?._id ?? null;
  // A plan marked unavailable to new tenants stays offered to whoever is
  // already grandfathered on it, but is hidden from everyone else picking a
  // plan for the first time.
  const visiblePlans = plans.filter((plan) =>
    plan.tier !== 'enterprise' &&
    (plan.availableToNewTenants !== false || plan._id === currentPlanId)
  );

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const subCopy = (dict?.subscription ?? {}) as Record<string, string | undefined>;

  const applyCoupon = async () => {
    const trimmed = couponCode.trim();
    if (!trimmed) return;
    setCouponApplying(true);
    setCouponError(null);
    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code: trimmed }),
      });
      const data = await res.json();
      if (data.success) {
        setAppliedCoupon(data.data);
      } else {
        setAppliedCoupon(null);
        setCouponError(data.error || subCopy.couponInvalid || 'Invalid coupon code');
      }
    } catch {
      setAppliedCoupon(null);
      setCouponError(subCopy.couponValidateFailed || 'Failed to validate coupon');
    } finally {
      setCouponApplying(false);
    }
  };

  // Preview only, mirroring create-payment: yearly is 12 months less 10%, then
  // the coupon comes off that amount. The server re-validates and re-computes,
  // so a stale or tampered value here can't change what gets charged.
  const couponCovers = (planId: string) =>
    !!appliedCoupon && (appliedCoupon.appliesTo !== 'specific_plans' || appliedCoupon.planIds.includes(planId));

  const priceFor = (plan: { _id: string; price: { monthly: number } }, cycle: BillingCycle, withCoupon = true): number => {
    const base = cycle === 'yearly' ? plan.price.monthly * 12 * 0.9 : plan.price.monthly;
    if (!withCoupon || !appliedCoupon || !couponCovers(plan._id)) return base;
    const discount = appliedCoupon.discountType === 'percentage'
      ? base * (appliedCoupon.discountValue / 100)
      : appliedCoupon.discountValue;
    return Math.max(0, Math.round((base - discount) * 100) / 100);
  };

  const money = (currency: string, amount: number) =>
    `${currency} ${amount.toLocaleString(lang, {
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    })}`;

  const handleUpgrade = async (planId: string, billingCycle: BillingCycle = 'monthly') => {
    const selectedPlanData = plans.find((p) => p._id === planId);
    if (!selectedPlanData) return;

    setUpgrading(billingCycle);
    setCouponError(null);
    try {
      const trimmedCoupon = couponCode.trim();
      const response = await fetch('/api/paypal/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ planId, billingCycle, couponCode: trimmedCoupon || undefined }),
      });

      const data = await response.json();

      if (data.success) {
        const approveLink = data.data?.paypalOrder?.links?.find(
          (link: { rel: string; href: string }) => link.rel === 'approve'
        );
        if (!approveLink?.href) {
          showToast.error(subCopy.paypalLinkMissing || 'PayPal did not return a payment page. Please try again.');
          setUpgrading(null);
          return;
        }
        try {
          localStorage.setItem(
            STORED_CHECKOUT_KEY,
            JSON.stringify({
              planId,
              billingCycle,
              amount: data.data.amount,
              currency: data.data.currency,
              couponCode: data.data.couponCode,
            })
          );
        } catch {
          // Storage blocked: the success page falls back to the query string
        }
        // Keep the keys disabled while the browser leaves for PayPal
        window.location.href = approveLink.href;
        return;
      } else if (trimmedCoupon) {
        setCouponError(data.error || subCopy.couponInvalid || 'Invalid coupon code');
      } else {
        showToast.error(
          data.error || subCopy.failedToCreatePayment || 'Failed to create payment'
        );
      }
    } catch (err) {
      console.error('Error creating payment:', err);
      showToast.error(subCopy.failedToInitiatePayment || 'Failed to initiate payment');
    }
    setUpgrading(null);
  };

  if (!dict) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-brand-navy-deep">
        <LoadingSpinner size="md" color="#8fe3d0" />
      </div>
    );
  }

  if (!canManageSubscription) {
    const forbidden = dict.components?.forbidden;
    return (
      <StatusSlip
        code="403"
        stamp={forbidden?.stamp || 'Denied'}
        title={dict.components?.protectedRoute?.accessDenied || 'Access Denied'}
        message={subCopy.noPermission || 'You don\'t have permission to manage the subscription. Required role: admin or higher.'}
      >
        <button type="button" onClick={() => router.back()} className={slipSecondaryKey}>
          {forbidden?.goBack || 'Go Back'}
        </button>
      </StatusSlip>
    );
  }

  const formatLimit = (value: number) => (value === -1 ? subCopy.unlimited || 'Unlimited' : value.toLocaleString(lang));

  const shell = {
    tag: settings?.companyName,
    title: subCopy.upgradeTitle || 'Upgrade Your Subscription',
    subtitle: subCopy.upgradeMessage || 'Choose a plan that fits your business needs.',
    back: (
      <Link
        href={`/${tenant}/${lang}/admin/subscriptions`}
        className="inline-flex min-h-[44px] items-center gap-1 font-receipt text-xs font-medium uppercase text-paper/70 transition-colors hover:text-paper-white"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        {dict.common.back || 'Back'}
      </Link>
    ),
  };

  if (status === 'loading') {
    return (
      <SubscriptionShell {...shell}>
        <SubscriptionPlansSkeleton />
      </SubscriptionShell>
    );
  }

  if (status === 'error') {
    return (
      <SubscriptionShell {...shell}>
        <div className="mt-6 max-w-2xl">
          <div className="bg-paper-white text-ink">
            <ErrorState
              title={subCopy.failedToLoadPlans || 'Failed to load subscription plans'}
              description={error || undefined}
              onRetry={refetch}
              retryLabel={dict.common.retry || 'Retry'}
            />
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </div>
      </SubscriptionShell>
    );
  }

  const couponCurrency = visiblePlans[0]?.price.currency || 'PHP';

  return (
    <SubscriptionShell {...shell}>
      {/* Discount code, keyed in like one at the register */}
      <div className="mt-6 max-w-xl border border-white/10 bg-black/20 p-3">
        <label htmlFor="coupon-code" className="mb-1 block font-receipt text-xs font-medium uppercase tracking-[0.08em] text-white/60">
          {subCopy.couponCode || 'Coupon code'}
        </label>
        <div className="flex gap-2">
          <input
            id="coupon-code"
            type="text"
            value={couponCode}
            onChange={(e) => {
              setCouponCode(e.target.value.toUpperCase());
              setCouponError(null);
              if (appliedCoupon) setAppliedCoupon(null);
            }}
            placeholder={subCopy.couponCodePlaceholder || 'Optional'}
            className="min-h-[44px] min-w-0 flex-1 border-2 border-transparent bg-paper-white px-3 py-2 font-receipt text-sm uppercase text-ink placeholder:normal-case placeholder:text-ink/45 focus:border-[#8fe3d0] focus:outline-none"
          />
          <button
            type="button"
            onClick={applyCoupon}
            disabled={couponApplying || !couponCode.trim() || !!appliedCoupon}
            className="flex min-h-[44px] shrink-0 items-center bg-paper-white px-5 font-receipt text-xs font-medium uppercase text-ink transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50"
          >
            {couponApplying ? '…' : appliedCoupon ? subCopy.applied || 'Applied' : subCopy.apply || 'Apply'}
          </button>
        </div>
        {couponError && (
          <p role="alert" className="mt-2 border-l-4 border-stamp bg-paper-white px-3 py-2 font-receipt text-sm text-ink">{couponError}</p>
        )}
        {appliedCoupon && (
          <p role="status" className="mt-2 border-l-4 border-brand bg-paper-white px-3 py-2 font-receipt text-sm text-ink">
            {subCopy.couponApplied || 'Coupon applied'}: {appliedCoupon.code} (
            {appliedCoupon.discountType === 'percentage'
              ? `${appliedCoupon.discountValue}%`
              : money(couponCurrency, appliedCoupon.discountValue)}{' '}
            {subCopy.off || 'off'})
          </p>
        )}
      </div>

      {visiblePlans.length === 0 ? (
        <div className="mt-6 max-w-2xl">
          <div className="bg-paper-white text-ink">
            <EmptyState icon="products" title={subCopy.noPlansAvailable || 'No subscription plans available'} />
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {visiblePlans.map((plan) => {
            const isCurrent = plan._id === currentPlanId;
            const isSelected = selectedPlan === plan._id;
            const monthly = priceFor(plan, 'monthly');
            const discounted = couponCovers(plan._id);
            return (
              <article key={plan._id} className="flex min-w-0 flex-col">
                <div className={`relative flex flex-1 flex-col bg-paper-white text-ink ${isSelected ? 'outline outline-4 outline-offset-0 outline-[#8fe3d0]' : ''}`}>
                  {isCurrent && (
                    <span className="mk-stamp absolute right-3 top-4 border-4 border-stamp px-2 py-1 font-display text-lg font-extrabold uppercase leading-none text-stamp">
                      {subCopy.currentPlan || 'Current Plan'}
                    </span>
                  )}
                  <div className="px-5 pb-4 pt-5">
                    <h2 className={`text-4xl ${isCurrent ? 'pr-24' : ''}`}>{plan.name}</h2>
                    <p className="mt-3 font-receipt">
                      {discounted && (
                        <span className="mr-2 text-base text-ink/50 line-through">{money(plan.price.currency, plan.price.monthly)}</span>
                      )}
                      <span className="text-3xl font-semibold">{money(plan.price.currency, monthly)}</span>
                      <span className="ml-1 text-sm text-ink/60">{subCopy.perMonth || '/month'}</span>
                    </p>
                    {plan.price.setupFee ? (
                      <p className="mt-1 font-receipt text-xs text-ink/60">
                        + {money(plan.price.currency, plan.price.setupFee)} {subCopy.oneTimeSetup || 'one-time setup'}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex-1 border-t border-dashed border-ink/30 px-5 py-4">
                    <div className="space-y-1 font-receipt text-sm uppercase">
                      <ReceiptRow label={subCopy.users || 'users'} value={formatLimit(plan.features.maxUsers)} />
                      <ReceiptRow label={subCopy.branches || 'branches'} value={formatLimit(plan.features.maxBranches)} />
                      <ReceiptRow label={subCopy.products || 'products'} value={formatLimit(plan.features.maxProducts)} />
                    </div>
                    {(plan.features.enableDiscounts || plan.features.enableMultiBranch || plan.features.prioritySupport) && (
                      <ul className="mt-4 space-y-2">
                        {plan.features.enableDiscounts && <Feature>{subCopy.discountsPromotions || 'Discounts & Promotions'}</Feature>}
                        {plan.features.enableMultiBranch && <Feature>{subCopy.multiBranchSupport || 'Multi-Branch Support'}</Feature>}
                        {plan.features.prioritySupport && <Feature>{subCopy.prioritySupport || 'Priority Support'}</Feature>}
                      </ul>
                    )}
                    {plan.birCompliance && (
                      <div className="mt-4 border-t border-dashed border-ink/30 pt-4">
                        <p className="mb-2 font-receipt text-xs font-medium uppercase tracking-[0.08em] text-ink/60">
                          {subCopy.birCompliance || 'BIR Compliance'}
                        </p>
                        <ul className="space-y-1.5">
                          {plan.birCompliance.auditTrailSystem && <Feature>{subCopy.auditTrailSystem || 'Audit Trail System'}</Feature>}
                          {plan.birCompliance.ptuAssistance && <Feature>{subCopy.ptuAssistance || 'PTU Assistance'}</Feature>}
                          {plan.birCompliance.receiptFormatting && <Feature>{subCopy.birReceiptFormatting || 'BIR Receipt Formatting'}</Feature>}
                          {plan.birCompliance.birDocumentation && <Feature>{subCopy.birDocumentation || 'BIR Documentation'}</Feature>}
                          {plan.birCompliance.casReporting && <Feature>{subCopy.casReporting || 'CAS-Ready Reporting'}</Feature>}
                          {plan.birCompliance.monthlySupport && <Feature>{subCopy.monthlyComplianceSupport || 'Monthly Compliance Support'}</Feature>}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-dashed border-ink/30 px-5 py-4">
                    {isSelected ? (
                      <div className="space-y-2">
                        <p className="font-receipt text-xs font-medium uppercase tracking-[0.08em] text-ink/70">
                          {subCopy.chooseBilling || 'Choose Billing Cycle'}
                        </p>
                        {(['monthly', 'yearly'] as const).map((cycle) => (
                          <button
                            key={cycle}
                            type="button"
                            onClick={() => handleUpgrade(plan._id, cycle)}
                            disabled={upgrading !== null}
                            className={`${cycle === 'monthly' ? PRIMARY_KEY : SECONDARY_KEY} min-h-[56px] justify-between text-left`}
                          >
                            <span>
                              {cycle === 'monthly' ? subCopy.monthly || 'Monthly' : subCopy.yearlyDiscount || 'Yearly (10% off)'}
                            </span>
                            <span className="whitespace-nowrap text-sm normal-case">
                              {upgrading === cycle ? subCopy.openingPayPal || 'Opening PayPal…' : money(plan.price.currency, priceFor(plan, cycle))}
                            </span>
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setSelectedPlan('')}
                          disabled={upgrading !== null}
                          className="flex min-h-[44px] w-full items-center justify-center font-receipt text-xs uppercase text-ink/70 underline hover:text-ink disabled:opacity-50"
                        >
                          {dict.common.cancel || 'Cancel'}
                        </button>
                      </div>
                    ) : isCurrent ? (
                      <p className="flex min-h-[44px] items-center justify-center gap-2 border border-ink/25 font-receipt text-xs font-medium uppercase text-ink/70">
                        <Check className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                        {subCopy.currentPlan || 'Current Plan'}
                      </p>
                    ) : (
                      <button type="button" onClick={() => setSelectedPlan(plan._id)} className={PRIMARY_KEY}>
                        {subCopy.selectPlan || 'Select Plan'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
              </article>
            );
          })}

          <article className="flex min-w-0 flex-col">
            <div className="flex flex-1 flex-col bg-ink text-paper">
              <div className="px-5 pb-4 pt-5">
                <h2 className="text-4xl text-paper-white">{subCopy.enterprise || 'Enterprise'}</h2>
                <p className="mt-3 font-receipt text-2xl font-semibold text-[#8fe3d0]">{subCopy.customPricing || 'Custom Pricing'}</p>
              </div>
              <div className="flex-1 border-t border-dashed border-white/25 px-5 py-4">
                <ul className="space-y-2 text-sm">
                  {[
                    subCopy.enterpriseUsers || 'Unlimited users, branches, products',
                    subCopy.enterpriseSupport || 'Dedicated support & integrations',
                    subCopy.enterpriseBilling || 'Custom billing & account manager',
                  ].map((line) => (
                    <li key={line} className={FEATURE}>
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#8fe3d0]" strokeWidth={1.75} aria-hidden />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 border-t border-dashed border-white/25 pt-4">
                  <p className="mb-2 font-receipt text-xs font-medium uppercase tracking-[0.08em] text-paper/60">
                    {subCopy.fullBirCompliance || 'Full BIR Compliance'}
                  </p>
                  <ul className="space-y-1.5">
                    {[
                      subCopy.enterpriseBirPtu || 'PTU + CAS + Audit Trail',
                      subCopy.enterpriseBirDocs || 'BIR Documentation & Receipts',
                      subCopy.monthlyComplianceSupport || 'Monthly Compliance Support',
                    ].map((line) => (
                      <li key={line} className={FEATURE}>
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#8fe3d0]" strokeWidth={1.75} aria-hidden />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="border-t border-dashed border-white/25 px-5 py-4">
                <a
                  href="mailto:admin@localpro.asia?subject=Enterprise%20Plan%20Inquiry"
                  className={`${KEY} bg-paper-white text-ink hover:bg-paper`}
                >
                  {subCopy.contactUs || 'Contact Us'}
                </a>
              </div>
            </div>
            <div className="mk-tear-b h-3 bg-ink" aria-hidden />
          </article>
        </div>
      )}

      <ul className="mt-10 flex flex-wrap gap-x-8 gap-y-3 border-t border-dashed border-white/20 pt-6">
        {[
          subCopy.securePayments || 'Secure Payments',
          subCopy.birCompliant || 'BIR Compliant',
          subCopy.moneyBack || '30-Day Money Back',
          subCopy.dataRetention || '10-Year Data Retention',
        ].map((label) => (
          <li key={label} className="flex items-center gap-2 font-receipt text-xs uppercase tracking-[0.08em] text-paper/70">
            <Check className="h-4 w-4 text-[#8fe3d0]" strokeWidth={1.75} aria-hidden />
            {label}
          </li>
        ))}
      </ul>
    </SubscriptionShell>
  );
}
