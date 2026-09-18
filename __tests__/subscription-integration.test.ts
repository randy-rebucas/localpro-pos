// Set env vars before any imports
process.env.JWT_SECRET = 'test-secret-for-subscription-tests-32chars!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — vi.mock factories are hoisted so we cannot reference module-level
// const variables inside them. Use vi.fn() directly and grab references via
// dynamic import inside beforeEach / tests.
// ---------------------------------------------------------------------------

vi.mock('@/lib/db', () => ({
  default: {
    subscription: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    subscriptionPlan: {
      findUnique: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    tenant: {
      update: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { SubscriptionService, checkFeatureAccess } from '@/lib/subscription';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan-1',
    name: 'Starter',
    maxUsers: 5,
    maxBranches: 1,
    maxProducts: 100,
    maxTransactions: 1000,
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
    birPtuAssistance: false,
    birReceiptFormatting: false,
    birDocumentation: false,
    birCasReporting: false,
    birAuditTrailSystem: true,
    birMonthlySupport: false,
    pharmacyComplianceEnabled: false,
    prescriptionManagement: false,
    expiryTracking: false,
    pdeaReporting: false,
    ...overrides,
  };
}

function makeSubscriptionDoc(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    id: 'sub-id-1',
    tenantId: 'tenant-1',
    planId: 'plan-1',
    status: 'active',
    isTrial: false,
    billingCycle: 'monthly',
    startDate: now,
    endDate: future,
    trialEndDate: undefined,
    nextBillingDate: future,
    usageCurrentUsers: 1,
    usageCurrentBranches: 1,
    usageCurrentProducts: 10,
    usageCurrentTransactions: 50,
    ...overrides,
  };
}

async function getSubscriptionMock() {
  const prisma = (await import('@/lib/db')).default;
  return { Subscription: prisma.subscription, SubscriptionPlan: prisma.subscriptionPlan };
}

// ---------------------------------------------------------------------------
// Starter plan — enableLoyaltyProgram: false
// ---------------------------------------------------------------------------
describe('SubscriptionService.checkFeature — starter plan (loyalty disabled)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { Subscription, SubscriptionPlan } = await getSubscriptionMock();
    vi.mocked(Subscription.findUnique).mockResolvedValue(makeSubscriptionDoc() as never);
    vi.mocked(SubscriptionPlan.findUnique).mockResolvedValue(makePlan() as never);
  });

  it('returns false for enableLoyaltyProgram on a starter plan', async () => {
    const allowed = await SubscriptionService.checkFeature('tenant-1', 'enableLoyaltyProgram');
    expect(allowed).toBe(false);
  });

  it('returns true for a feature that is enabled on the starter plan', async () => {
    const allowed = await SubscriptionService.checkFeature('tenant-1', 'enableInventory');
    expect(allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Pro plan — enableLoyaltyProgram: true
// ---------------------------------------------------------------------------
describe('SubscriptionService.checkFeature — pro plan (loyalty enabled)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { Subscription, SubscriptionPlan } = await getSubscriptionMock();
    vi.mocked(Subscription.findUnique).mockResolvedValue(makeSubscriptionDoc() as never);
    vi.mocked(SubscriptionPlan.findUnique).mockResolvedValue(
      makePlan({
        name: 'Pro',
        enableLoyaltyProgram: true,
        enableCustomerManagement: true,
        birPtuAssistance: true,
        birReceiptFormatting: true,
      }) as never
    );
  });

  it('returns true for enableLoyaltyProgram on a pro plan', async () => {
    const allowed = await SubscriptionService.checkFeature('tenant-1', 'enableLoyaltyProgram');
    expect(allowed).toBe(true);
  });

  it('returns true for enableCustomerManagement on a pro plan', async () => {
    const allowed = await SubscriptionService.checkFeature('tenant-1', 'enableCustomerManagement');
    expect(allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkFeatureAccess — throws when access is denied
// ---------------------------------------------------------------------------
describe('checkFeatureAccess — starter plan', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { Subscription, SubscriptionPlan } = await getSubscriptionMock();
    vi.mocked(Subscription.findUnique).mockResolvedValue(makeSubscriptionDoc() as never);
    vi.mocked(SubscriptionPlan.findUnique).mockResolvedValue(makePlan() as never);
  });

  it('throws when the feature is not available', async () => {
    await expect(checkFeatureAccess('tenant-1', 'enableLoyaltyProgram')).rejects.toThrow(
      "Feature 'enableLoyaltyProgram' is not available"
    );
  });

  it('does not throw when the feature is available', async () => {
    await expect(checkFeatureAccess('tenant-1', 'enableInventory')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getSubscriptionStatus — expired subscription
// ---------------------------------------------------------------------------
describe('SubscriptionService.getSubscriptionStatus — expired subscription', () => {
  it('reports isExpired: true when endDate is in the past', async () => {
    vi.clearAllMocks();
    const { Subscription, SubscriptionPlan } = await getSubscriptionMock();
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // yesterday
    vi.mocked(Subscription.findUnique).mockResolvedValue(
      makeSubscriptionDoc({ status: 'active', endDate: pastDate }) as never
    );
    vi.mocked(SubscriptionPlan.findUnique).mockResolvedValue(makePlan() as never);

    const status = await SubscriptionService.getSubscriptionStatus('tenant-1');
    expect(status).not.toBeNull();
    expect(status!.isExpired).toBe(true);
  });

  it('returns allowed: false for limits when subscription is expired', async () => {
    vi.clearAllMocks();
    const { Subscription, SubscriptionPlan } = await getSubscriptionMock();
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    vi.mocked(Subscription.findUnique).mockResolvedValue(
      makeSubscriptionDoc({ status: 'active', isTrial: false, endDate: pastDate }) as never
    );
    vi.mocked(SubscriptionPlan.findUnique).mockResolvedValue(makePlan() as never);

    const result = await SubscriptionService.checkLimit('tenant-1', 'maxUsers', 1);
    expect(result.allowed).toBe(false);
    expect(result.upgradeRequired).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getSubscriptionStatus — no subscription found (free tier fallback)
// ---------------------------------------------------------------------------
describe('SubscriptionService — no subscription found', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { Subscription } = await getSubscriptionMock();
    vi.mocked(Subscription.findUnique).mockResolvedValue(null);
  });

  it('getSubscriptionStatus returns null when no subscription exists', async () => {
    const status = await SubscriptionService.getSubscriptionStatus('tenant-new');
    expect(status).toBeNull();
  });

  it('checkFeature falls back to basic features (enableInventory allowed)', async () => {
    const allowed = await SubscriptionService.checkFeature('tenant-new', 'enableInventory');
    expect(allowed).toBe(true);
  });

  it('checkFeature falls back: non-basic feature (enableLoyaltyProgram) is not allowed', async () => {
    const allowed = await SubscriptionService.checkFeature('tenant-new', 'enableLoyaltyProgram');
    expect(allowed).toBe(false);
  });

  it('checkLimit falls back to allowing with a limit of 10', async () => {
    const result = await SubscriptionService.checkLimit('tenant-new', 'maxUsers', 3);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// getSubscriptionStatus — inactive subscription (not active, not trial)
// ---------------------------------------------------------------------------
describe('SubscriptionService — inactive subscription', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { Subscription, SubscriptionPlan } = await getSubscriptionMock();
    vi.mocked(Subscription.findUnique).mockResolvedValue(
      makeSubscriptionDoc({ status: 'cancelled', isTrial: false }) as never
    );
    vi.mocked(SubscriptionPlan.findUnique).mockResolvedValue(makePlan() as never);
  });

  it('checkFeature returns false when subscription is inactive', async () => {
    const allowed = await SubscriptionService.checkFeature('tenant-1', 'enableInventory');
    expect(allowed).toBe(false);
  });

  it('checkLimit returns allowed: false when subscription is inactive', async () => {
    const result = await SubscriptionService.checkLimit('tenant-1', 'maxUsers', 1);
    expect(result.allowed).toBe(false);
    expect(result.upgradeRequired).toBe(true);
  });
});
