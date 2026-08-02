import prisma from '@/lib/prisma';
import type { SubscriptionPlan } from '@prisma/client';

// Maps the flat Prisma columns (priceMonthly/priceSetupFee/priceCurrency) back to the
// nested `price: { monthly, setupFee, currency }` shape the frontend/API contract expects
// (this mirrors the old Mongoose SubscriptionPlan.price sub-document).
export function planToApi(plan: SubscriptionPlan & { subscriberCount?: number }) {
  const { id, priceMonthly, priceSetupFee, priceCurrency, reactivationFee, yearlyDiscount, ...rest } = plan;
  return {
    _id: id,
    ...rest,
    price: {
      monthly: Number(priceMonthly),
      setupFee: Number(priceSetupFee),
      currency: priceCurrency,
    },
    reactivationFee: Number(reactivationFee),
    yearlyDiscount: Number(yearlyDiscount),
  };
}

export async function getActiveSubscriptionPlans() {
  return prisma.subscriptionPlan.findMany({
    where: { isActive: true },
    orderBy: { priceMonthly: 'asc' },
  });
}

export async function getAllSubscriptionPlans() {
  return prisma.subscriptionPlan.findMany({ orderBy: { priceMonthly: 'asc' } });
}

export async function getSubscriptionPlanById(id: string) {
  return prisma.subscriptionPlan.findUnique({ where: { id } });
}

export async function getSubscriptionPlanByTier(tier: string) {
  return prisma.subscriptionPlan.findUnique({ where: { tier: tier as any } }); // eslint-disable-line @typescript-eslint/no-explicit-any
}
