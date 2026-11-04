// Set env vars before any imports
process.env.JWT_SECRET = 'test-secret-for-subscription-billing-tests-32chars!';
(process.env as Record<string, string>).NODE_ENV = 'test';
process.env.BILLING_ADMIN_EMAIL = 'admin@localpro.asia';

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — vi.mock factories are hoisted so we cannot reference module-level
// const variables inside them. Use vi.fn() directly and grab references via
// dynamic import inside beforeEach / tests. Never attach `.then` to a mock
// object — always use mockResolvedValue/mockReturnValue (see project memory
// on the vitest thenable OOM bug).
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

const repos = vi.hoisted(() => ({
  tenants: { findById: vi.fn(), update: vi.fn().mockResolvedValue(null) },
  subscriptions: { findAcrossTenants: vi.fn(), update: vi.fn().mockResolvedValue(null) },
  subscriptionPlans: { list: vi.fn() },
  billingEvents: { create: vi.fn().mockResolvedValue({}) },
  invoices: { create: vi.fn().mockResolvedValue({ _id: 'invoice-1' }) },
}));
vi.mock('@/lib/db', () => ({ getRepos: () => repos }));

vi.mock('@/lib/receipt', () => ({
  generateInvoiceNumber: vi.fn().mockResolvedValue('INV-20260701-00001'),
}));

vi.mock('@/lib/notifications', () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/tenant', () => ({
  getTenantSettingsById: vi.fn().mockResolvedValue({
    email: 'billing@test-tenant.com',
    emailNotifications: true,
  }),
}));

import { processSubscriptionBilling } from '@/lib/automations/subscription-billing';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

const PLAN_DOC = {
  _id: 'plan-1',
  name: 'Starter',
  price: { monthly: 1000, currency: 'PHP', setupFee: 0 },
  reactivationFee: 500,
};

function makeSub(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'sub-1',
    tenantId: 'tenant-1',
    planId: 'plan-1',
    status: 'active',
    autoRenew: true,
    billingCycle: 'monthly',
    nextBillingDate: new Date(),
    paymentOverdue: false,
    outstandingBalance: 0,
    billingHistory: [] as Array<Record<string, unknown>>,
    ...overrides,
  };
}

async function getMocks() {
  const { sendEmail } = await import('@/lib/notifications');
  return { sendEmail };
}

/**
 * processSubscriptionBilling() calls subscriptions.findAcrossTenants() exactly 6 times in a
 * fixed sequential order (invoice generation, overdue flagging, reminder
 * window, deactivation, late fee, reactivation fee). Rather than replicate
 * Mongo's query matching semantics, we key off call order: give the step
 * under test its subscription(s), and empty arrays everywhere else.
 */
function mockFindSequence(resultsByCallIndex: Record<number, unknown[]>) {
  let callIndex = 0;
  return () => {
    callIndex++;
    return Promise.resolve(resultsByCallIndex[callIndex] || []);
  };
}

/** The `set` of the single subscriptions.update() call. */
function updateSet() {
  expect(repos.subscriptions.update).toHaveBeenCalledTimes(1);
  return repos.subscriptions.update.mock.calls[0][2].set;
}


beforeEach(async () => {
  vi.clearAllMocks();
  repos.subscriptionPlans.list.mockResolvedValue([PLAN_DOC]);
  repos.tenants.findById.mockResolvedValue({ _id: 'tenant-1', name: 'Test Tenant' });
});

// ---------------------------------------------------------------------------
// Step 1 — invoice generation (due date - 3 days)
// ---------------------------------------------------------------------------
describe('processSubscriptionBilling — invoice generation', () => {
  it('generates an invoice and notifies the tenant when due within 3 days', async () => {
    const { sendEmail } = await getMocks();
    const sub = makeSub({
      nextBillingDate: new Date(Date.now() + 2 * DAY_MS),
      lastInvoiceGeneratedAt: undefined,
    });
    repos.subscriptions.findAcrossTenants.mockImplementation(mockFindSequence({ 1: [sub] }));

    const result = await processSubscriptionBilling();

    expect(result.details.invoicesGenerated).toBe(1);
    expect(repos.invoices.create).toHaveBeenCalledTimes(1);
    expect(repos.invoices.create).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ total: 1000, status: 'sent' })
    );
    expect(repos.billingEvents.create).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ type: 'invoice_generated', amount: 1000 })
    );
    expect(repos.subscriptions.update).toHaveBeenCalledWith('tenant-1', 'sub-1', {
      set: { lastInvoiceGeneratedAt: expect.any(Date) },
    });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'billing@test-tenant.com' })
    );
  });

  it('skips generating a second invoice for the same billing cycle', async () => {
    const nextBillingDate = new Date(Date.now() + 1 * DAY_MS);
    const sub = makeSub({
      nextBillingDate,
      lastInvoiceGeneratedAt: new Date(), // already generated today, within this cycle
    });
    repos.subscriptions.findAcrossTenants.mockImplementation(mockFindSequence({ 1: [sub] }));

    const result = await processSubscriptionBilling();

    expect(result.details.invoicesGenerated).toBe(0);
    expect(repos.invoices.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Step 2 — overdue flagging + grace period + reminder emails
// ---------------------------------------------------------------------------
describe('processSubscriptionBilling — overdue flagging', () => {
  it('flags payment overdue, starts a 7-day grace period, and notifies tenant + admin', async () => {
    const { sendEmail } = await getMocks();
    const nextBillingDate = new Date(Date.now() - 1 * DAY_MS);
    const sub = makeSub({ nextBillingDate, paymentOverdue: false });
    repos.subscriptions.findAcrossTenants.mockImplementation(mockFindSequence({ 2: [sub] }));

    const result = await processSubscriptionBilling();

    expect(result.details.overdueFlagged).toBe(1);
    const set = updateSet();
    expect(set.paymentOverdue).toBe(true);
    expect(set.gracePeriodEndDate).toBeInstanceOf(Date);
    expect((set.gracePeriodEndDate as Date).getTime()).toBeCloseTo(
      nextBillingDate.getTime() + 7 * DAY_MS,
      -3 // within ~1 second tolerance
    );
    expect(repos.billingEvents.create).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ type: 'payment_overdue' })
    );

    const emailRecipients = vi.mocked(sendEmail).mock.calls.map((call) => call[0].to);
    expect(emailRecipients).toContain('billing@test-tenant.com');
    expect(emailRecipients).toContain('admin@localpro.asia');
  });
});

// ---------------------------------------------------------------------------
// Step 3 — reminder / redirect-to-support window (+7 to +10 days)
// ---------------------------------------------------------------------------
describe('processSubscriptionBilling — reminder window', () => {
  it('sends a final-notice reminder without changing subscription status', async () => {
    const { sendEmail } = await getMocks();
    const sub = makeSub({
      paymentOverdue: true,
      gracePeriodEndDate: new Date(Date.now() - 1 * DAY_MS), // within the +0..+3d reminder window
      deactivatedAt: undefined,
    });
    repos.subscriptions.findAcrossTenants.mockImplementation(mockFindSequence({ 3: [sub] }));

    const result = await processSubscriptionBilling();

    expect(result.details.remindersSent).toBe(1);
    expect(sub.status).toBe('active'); // unchanged
    expect(repos.subscriptions.update).not.toHaveBeenCalled();
    const emailRecipients = vi.mocked(sendEmail).mock.calls.map((call) => call[0].to);
    expect(emailRecipients).toContain('billing@test-tenant.com');
    expect(emailRecipients).toContain('admin@localpro.asia');
  });
});

// ---------------------------------------------------------------------------
// Step 4 — deactivation (10 days past due)
// ---------------------------------------------------------------------------
describe('processSubscriptionBilling — deactivation', () => {
  it('suspends the subscription and deactivates the tenant after 10 days unpaid', async () => {
    const { sendEmail } = await getMocks();
    const sub = makeSub({
      paymentOverdue: true,
      gracePeriodEndDate: new Date(Date.now() - 4 * DAY_MS), // 3+ days past grace period end
      deactivatedAt: undefined,
    });
    repos.subscriptions.findAcrossTenants.mockImplementation(mockFindSequence({ 4: [sub] }));

    const result = await processSubscriptionBilling();

    expect(result.details.accountsDeactivated).toBe(1);
    const set = updateSet();
    expect(set.status).toBe('suspended');
    expect(set.suspendedAt).toBeInstanceOf(Date);
    expect(set.deactivatedAt).toBeInstanceOf(Date);
    expect(repos.tenants.update).toHaveBeenCalledWith('tenant-1', { set: { isActive: false } });
    expect(repos.billingEvents.create).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ type: 'account_deactivated' })
    );
    const emailRecipients = vi.mocked(sendEmail).mock.calls.map((call) => call[0].to);
    expect(emailRecipients).toContain('billing@test-tenant.com');
    expect(emailRecipients).toContain('admin@localpro.asia');
  });
});

// ---------------------------------------------------------------------------
// Step 5 — 10% late fee (15 days past due)
// ---------------------------------------------------------------------------
describe('processSubscriptionBilling — late fee', () => {
  it('adds a 10% late charge to the outstanding balance after 15 days unpaid', async () => {
    const { sendEmail } = await getMocks();
    const sub = makeSub({
      paymentOverdue: true,
      nextBillingDate: new Date(Date.now() - 16 * DAY_MS),
      outstandingBalance: 0,
      lateFeeAppliedAt: undefined,
    });
    repos.subscriptions.findAcrossTenants.mockImplementation(mockFindSequence({ 5: [sub] }));

    const result = await processSubscriptionBilling();

    expect(result.details.lateFeesApplied).toBe(1);
    const [, , ops] = repos.subscriptions.update.mock.calls[0];
    expect(ops.set.outstandingBalance).toBe(100); // 10% of 1000
    expect(ops.set.lateFeeAppliedAt).toBeInstanceOf(Date);
    expect(ops.addBillingEntry).toMatchObject({ amount: 100, status: 'pending' });
    expect(repos.billingEvents.create).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ type: 'late_fee_applied', amount: 100 })
    );
    // Late fee step only sends the internal admin alert, no tenant email
    const emailRecipients = vi.mocked(sendEmail).mock.calls.map((call) => call[0].to);
    expect(emailRecipients).toEqual(['admin@localpro.asia']);
  });
});

// ---------------------------------------------------------------------------
// Step 6 — flat reactivation fee (30 days past due)
// ---------------------------------------------------------------------------
describe('processSubscriptionBilling — reactivation fee', () => {
  it('adds the plan reactivation fee to the outstanding balance after 30 days unpaid', async () => {
    const { sendEmail } = await getMocks();
    const sub = makeSub({
      paymentOverdue: true,
      nextBillingDate: new Date(Date.now() - 31 * DAY_MS),
      outstandingBalance: 100, // e.g. a late fee already applied
      reactivationFeeAppliedAt: undefined,
    });
    repos.subscriptions.findAcrossTenants.mockImplementation(mockFindSequence({ 6: [sub] }));

    const result = await processSubscriptionBilling();

    expect(result.details.reactivationFeesApplied).toBe(1);
    const set = updateSet();
    expect(set.outstandingBalance).toBe(600); // 100 existing + 500 flat reactivation fee
    expect(set.reactivationFeeAppliedAt).toBeInstanceOf(Date);
    expect(repos.billingEvents.create).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ type: 'reactivation_fee_applied', amount: 500 })
    );
    const emailRecipients = vi.mocked(sendEmail).mock.calls.map((call) => call[0].to);
    expect(emailRecipients).toEqual(['admin@localpro.asia']);
  });
});

// ---------------------------------------------------------------------------
// Resilience — a failure on one subscription doesn't abort the whole run
// ---------------------------------------------------------------------------
describe('processSubscriptionBilling — per-item error isolation', () => {
  it('records an error for a failing subscription but still processes others', async () => {
        const failingSub = makeSub({
      _id: 'sub-fail',
      nextBillingDate: new Date(Date.now() - 1 * DAY_MS),
      paymentOverdue: false,
    });
    const okSub = makeSub({
      _id: 'sub-ok',
      tenantId: 'tenant-2',
      nextBillingDate: new Date(Date.now() - 1 * DAY_MS),
      paymentOverdue: false,
    });

    repos.billingEvents.create.mockRejectedValueOnce(new Error('simulated billing event failure'));
    repos.subscriptions.findAcrossTenants.mockImplementation(mockFindSequence({ 2: [failingSub, okSub] }));

    const result = await processSubscriptionBilling();

    expect(result.success).toBe(false);
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(result.errors.some((e) => e.includes('sub-fail'))).toBe(true);
    // The second subscription in the same batch should still be processed
    expect(result.details.overdueFlagged).toBe(1);
    expect(repos.subscriptions.update).toHaveBeenCalledWith('tenant-2', 'sub-ok', {
      set: expect.objectContaining({ paymentOverdue: true }),
    });
  });
});
