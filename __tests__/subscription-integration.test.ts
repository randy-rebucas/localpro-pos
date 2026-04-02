// Set env vars before any imports
process.env.JWT_SECRET = 'test-secret-for-subscription-tests-32chars!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — vi.mock factories are hoisted so we cannot reference module-level
// const variables inside them. Use vi.fn() directly and grab references via
// dynamic import inside beforeEach / tests.
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/models/Subscription', () => ({
  default: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn().mockResolvedValue(null),
    findByIdAndUpdate: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('@/models/SubscriptionPlan', () => ({
  default: {
    find: vi.fn().mockReturnValue({ sort: vi.fn().mockResolvedValue([]) }),
    findOne: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('@/models/Tenant', () => ({
  default: {
    findByIdAndUpdate: vi.fn().mockResolvedValue(null),
  },
}));

import { SubscriptionService, checkFeatureAccess } from '@/lib/subscription';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlanFeatures(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

function makeSubscriptionDoc(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    _id: 'sub-id-1',
    tenantId: 'tenant-1',
    status: 'active',
    isTrial: false,
    billingCycle: 'monthly',
    startDate: now,
    endDate: future,
    trialEndDate: undefined,
    nextBillingDate: future,
    usage: {
      currentUsers: 1,
      currentBranches: 1,
      currentProducts: 10,
      currentTransactions: 50,
    },
    planId: {
      name: 'Starter',
      features: makePlanFeatures(),
      birCompliance: {
        ptuAssistance: false,
        receiptFormatting: false,
        birDocumentation: false,
        casReporting: false,
        auditTrailSystem: true,
        monthlySupport: false,
      },
    },
    ...overrides,
  };
}

async function getSubscriptionMock() {
  const Subscription = (await import('@/models/Subscription')).default;
  return Subscription;
}

// ---------------------------------------------------------------------------
// Starter plan — enableLoyaltyProgram: false
// ---------------------------------------------------------------------------
describe('SubscriptionService.checkFeature — starter plan (loyalty disabled)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const Subscription = await getSubscriptionMock();
    vi.mocked(Subscription.findOne).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(makeSubscriptionDoc()),
      }),
    } as unknown as ReturnType<typeof Subscription.findOne>);
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
    const Subscription = await getSubscriptionMock();
    vi.mocked(Subscription.findOne).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(
          makeSubscriptionDoc({
            planId: {
              name: 'Pro',
              features: makePlanFeatures({ enableLoyaltyProgram: true, enableCustomerManagement: true }),
              birCompliance: {
                ptuAssistance: true,
                receiptFormatting: true,
                birDocumentation: false,
                casReporting: false,
                auditTrailSystem: true,
                monthlySupport: false,
              },
            },
          })
        ),
      }),
    } as unknown as ReturnType<typeof Subscription.findOne>);
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
    const Subscription = await getSubscriptionMock();
    vi.mocked(Subscription.findOne).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(makeSubscriptionDoc()),
      }),
    } as unknown as ReturnType<typeof Subscription.findOne>);
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
    const Subscription = await getSubscriptionMock();
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // yesterday
    vi.mocked(Subscription.findOne).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(
          makeSubscriptionDoc({
            status: 'active',
            endDate: pastDate,
          })
        ),
      }),
    } as unknown as ReturnType<typeof Subscription.findOne>);

    const status = await SubscriptionService.getSubscriptionStatus('tenant-1');
    expect(status).not.toBeNull();
    expect(status!.isExpired).toBe(true);
  });

  it('returns allowed: false for limits when subscription is expired', async () => {
    vi.clearAllMocks();
    const Subscription = await getSubscriptionMock();
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    vi.mocked(Subscription.findOne).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(
          makeSubscriptionDoc({
            status: 'active',
            isTrial: false,
            endDate: pastDate,
          })
        ),
      }),
    } as unknown as ReturnType<typeof Subscription.findOne>);

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
    const Subscription = await getSubscriptionMock();
    vi.mocked(Subscription.findOne).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      }),
    } as unknown as ReturnType<typeof Subscription.findOne>);
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
    const Subscription = await getSubscriptionMock();
    vi.mocked(Subscription.findOne).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(
          makeSubscriptionDoc({ status: 'cancelled', isTrial: false })
        ),
      }),
    } as unknown as ReturnType<typeof Subscription.findOne>);
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
