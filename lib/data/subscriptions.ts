import prisma from '@/lib/prisma';
import type { Subscription, SubscriptionPlan, Tenant, SubscriptionBillingHistoryEntry } from '@prisma/client';
import { planToApi } from '@/lib/data/subscription-plans';

type SubWithRelations = Subscription & {
  tenant?: Tenant | null;
  plan?: SubscriptionPlan | null;
  billingHistory?: SubscriptionBillingHistoryEntry[];
};

// Maps a Prisma Subscription row (with optional included tenant/plan/billingHistory)
// back to the Mongoose-shaped API response: _id, populated tenantId/planId objects,
// Decimal fields coerced to Number, and Json paymentMethod/usage passed through as-is.
export function subscriptionToApi(sub: SubWithRelations) {
  const { id, tenant, plan, billingHistory, outstandingBalance, ...rest } = sub;
  const out: Record<string, unknown> = {
    _id: id,
    ...rest,
    outstandingBalance: Number(outstandingBalance),
  };
  if (tenant) {
    out.tenantId = { _id: tenant.id, slug: tenant.slug, name: tenant.name, settings: tenant.settings };
  } else {
    out.tenantId = sub.tenantId;
  }
  if (plan) {
    out.planId = planToApi(plan);
  } else {
    out.planId = sub.planId;
  }
  if (billingHistory) {
    out.billingHistory = billingHistory.map((b) => ({
      _id: b.id,
      date: b.date,
      amount: Number(b.amount),
      currency: b.currency,
      status: b.status,
      transactionId: b.transactionId,
      invoiceUrl: b.invoiceUrl,
    }));
  }
  return out;
}

export async function getSubscriptionByTenantId(tenantId: string) {
  return prisma.subscription.findUnique({ where: { tenantId } });
}

export async function getSubscriptionByTenantIdWithPlan(tenantId: string) {
  return prisma.subscription.findUnique({
    where: { tenantId },
    include: { plan: true },
  });
}

export async function getSubscriptionByTenantIdWithBillingHistory(tenantId: string) {
  return prisma.subscription.findUnique({
    where: { tenantId },
    include: { billingHistory: { orderBy: { date: 'desc' } } },
  });
}

export async function getSubscriptionById(id: string) {
  return prisma.subscription.findUnique({
    where: { id },
    include: { tenant: true, plan: true },
  });
}
