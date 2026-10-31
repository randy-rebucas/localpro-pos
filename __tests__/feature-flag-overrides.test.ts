import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  subscriptionFindOne: vi.fn(),
  overrideFind: vi.fn(),
}));

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/models/Subscription', () => ({
  default: { findOne: mocks.subscriptionFindOne, findByIdAndUpdate: vi.fn() },
}));
vi.mock('@/models/SubscriptionPlan', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/Tenant', () => ({ default: { findByIdAndUpdate: vi.fn() } }));
vi.mock('@/models/Transaction', () => ({ default: { countDocuments: vi.fn() } }));
vi.mock('@/models/FeatureFlagOverride', () => ({ default: { find: mocks.overrideFind } }));

import { SubscriptionService, isOverridableFeature } from '@/lib/subscription';

const future = new Date(Date.now() + 30 * 86400000);
const past = new Date(Date.now() - 86400000);

function mockSubscription() {
  mocks.subscriptionFindOne.mockReturnValue({
    populate: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'sub-1',
        status: 'active',
        isTrial: false,
        billingCycle: 'monthly',
        endDate: future,
        usage: { currentUsers: 1, currentBranches: 1, currentProducts: 1, currentTransactions: 1 },
        planId: {
          name: 'Starter',
          features: {
            maxUsers: 2, maxBranches: 1, maxProducts: 100, maxTransactions: 500,
            enableInventory: true, enableCategories: true, enableDiscounts: false,
            enableLoyaltyProgram: false, enableCustomerManagement: false,
            enableBookingScheduling: false, enableReports: true, enableMultiBranch: false,
            enableHardwareIntegration: false, prioritySupport: false,
            customIntegrations: false, dedicatedAccountManager: false,
          },
          birCompliance: { casReporting: false },
        },
      }),
    }),
  });
}

function mockOverrides(rows: Array<{ feature: string; enabled: boolean; expiresAt?: Date }>) {
  mocks.overrideFind.mockReturnValue({
    select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(rows) }),
  });
}

describe('feature flag overrides', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscription();
  });

  it('enables and disables plan features per tenant', async () => {
    mockOverrides([
      { feature: 'enableLoyaltyProgram', enabled: true },
      { feature: 'enableReports', enabled: false },
      { feature: 'casReporting', enabled: true },
    ]);

    const status = await SubscriptionService.getSubscriptionStatus('t1');
    expect(status?.features.enableLoyaltyProgram).toBe(true);
    expect(status?.features.enableReports).toBe(false);
    expect(status?.birCompliance.casReporting).toBe(true);
    expect(mocks.overrideFind).toHaveBeenCalledWith({ tenantId: 't1' });
  });

  it('ignores expired overrides', async () => {
    mockOverrides([{ feature: 'enableLoyaltyProgram', enabled: true, expiresAt: past }]);

    const status = await SubscriptionService.getSubscriptionStatus('t1');
    expect(status?.features.enableLoyaltyProgram).toBe(false);
  });

  it('falls back to the plan when overrides cannot be loaded', async () => {
    mocks.overrideFind.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockRejectedValue(new Error('db down')) }),
    });

    const status = await SubscriptionService.getSubscriptionStatus('t1');
    expect(status?.features.enableInventory).toBe(true);
    expect(status?.features.enableLoyaltyProgram).toBe(false);
  });

  it('validates feature names', () => {
    expect(isOverridableFeature('enableLoyaltyProgram')).toBe(true);
    expect(isOverridableFeature('pdeaReporting')).toBe(true);
    expect(isOverridableFeature('maxUsers')).toBe(false);
    expect(isOverridableFeature('nonsense')).toBe(false);
  });
});
