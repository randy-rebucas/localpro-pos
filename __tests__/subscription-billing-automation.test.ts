// Set env vars before any imports
process.env.JWT_SECRET = 'test-secret-for-subscription-billing-tests-32chars!';
process.env.NODE_ENV = 'test';
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

vi.mock('@/models/Subscription', () => ({
  default: {
    find: vi.fn(),
  },
}));

vi.mock('@/models/SubscriptionPlan', () => ({
  default: {
    find: vi.fn(),
  },
}));

vi.mock('@/models/Tenant', () => ({
  default: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('@/models/Invoice', () => ({
  default: {
    create: vi.fn().mockResolvedValue({ _id: 'invoice-1' }),
  },
}));

vi.mock('@/models/BillingEvent', () => ({
  default: {
    create: vi.fn().mockResolvedValue({}),
  },
}));

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
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function getMocks() {
  const Subscription = (await import('@/models/Subscription')).default;
  const SubscriptionPlan = (await import('@/models/SubscriptionPlan')).default;
  const Tenant = (await import('@/models/Tenant')).default;
  const Invoice = (await import('@/models/Invoice')).default;
  const BillingEvent = (await import('@/models/BillingEvent')).default;
  const { sendEmail } = await import('@/lib/notifications');
  return { Subscription, SubscriptionPlan, Tenant, Invoice, BillingEvent, sendEmail };
}

/**
 * processSubscriptionBilling() calls Subscription.find() exactly 6 times in a
 * fixed sequential order (invoice generation, overdue flagging, reminder
 * window, deactivation, late fee, reactivation fee). Rather than replicate
 * Mongo's query matching semantics, we key off call order: give the step
 * under test its subscription(s), and empty arrays everywhere else.
 */
function mockFindSequence(resultsByCallIndex: Record<number, unknown[]>) {
  let callIndex = 0;
  return vi.fn().mockImplementation(() => {
    callIndex++;
    return Promise.resolve(resultsByCallIndex[callIndex] || []);
  });
}

function tenantFindByIdMock(name = 'Test Tenant') {
  return vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue({ name }),
    }),
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  const { SubscriptionPlan, Tenant } = await getMocks();
  vi.mocked(SubscriptionPlan.find).mockReturnValue({
    lean: vi.fn().mockResolvedValue([PLAN_DOC]),
  } as unknown as ReturnType<typeof SubscriptionPlan.find>);
  vi.mocked(Tenant.findById).mockImplementation(tenantFindByIdMock());
});

// ---------------------------------------------------------------------------
// Step 1 — invoice generation (due date - 3 days)
// ---------------------------------------------------------------------------
describe('processSubscriptionBilling — invoice generation', () => {
  it('generates an invoice and notifies the tenant when due within 3 days', async () => {
    const { Subscription, Invoice, BillingEvent, sendEmail } = await getMocks();
    const sub = makeSub({
      nextBillingDate: new Date(Date.now() + 2 * DAY_MS),
      lastInvoiceGeneratedAt: undefined,
    });
    vi.mocked(Subscription.find).mockImplementation(mockFindSequence({ 1: [sub] }));

    const result = await processSubscriptionBilling();

    expect(result.details.invoicesGenerated).toBe(1);
    expect(Invoice.create).toHaveBeenCalledTimes(1);
    expect(Invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', total: 1000, status: 'sent' })
    );
    expect(BillingEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'invoice_generated', amount: 1000 })
    );
    expect(sub.lastInvoiceGeneratedAt).toBeInstanceOf(Date);
    expect(sub.save).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'billing@test-tenant.com' })
    );
  });

  it('skips generating a second invoice for the same billing cycle', async () => {
    const { Subscription, Invoice } = await getMocks();
    const nextBillingDate = new Date(Date.now() + 1 * DAY_MS);
    const sub = makeSub({
      nextBillingDate,
      lastInvoiceGeneratedAt: new Date(), // already generated today, within this cycle
    });
    vi.mocked(Subscription.find).mockImplementation(mockFindSequence({ 1: [sub] }));

    const result = await processSubscriptionBilling();

    expect(result.details.invoicesGenerated).toBe(0);
    expect(Invoice.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Step 2 — overdue flagging + grace period + reminder emails
// ---------------------------------------------------------------------------
describe('processSubscriptionBilling — overdue flagging', () => {
  it('flags payment overdue, starts a 7-day grace period, and notifies tenant + admin', async () => {
    const { Subscription, BillingEvent, sendEmail } = await getMocks();
    const nextBillingDate = new Date(Date.now() - 1 * DAY_MS);
    const sub = makeSub({ nextBillingDate, paymentOverdue: false });
    vi.mocked(Subscription.find).mockImplementation(mockFindSequence({ 2: [sub] }));

    const result = await processSubscriptionBilling();

    expect(result.details.overdueFlagged).toBe(1);
    expect(sub.paymentOverdue).toBe(true);
    expect(sub.gracePeriodEndDate).toBeInstanceOf(Date);
    expect((sub.gracePeriodEndDate as Date).getTime()).toBeCloseTo(
      nextBillingDate.getTime() + 7 * DAY_MS,
      -3 // within ~1 second tolerance
    );
    expect(BillingEvent.create).toHaveBeenCalledWith(
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
    const { Subscription, sendEmail } = await getMocks();
    const sub = makeSub({
      paymentOverdue: true,
      gracePeriodEndDate: new Date(Date.now() - 1 * DAY_MS), // within the +0..+3d reminder window
      deactivatedAt: undefined,
    });
    vi.mocked(Subscription.find).mockImplementation(mockFindSequence({ 3: [sub] }));

    const result = await processSubscriptionBilling();

    expect(result.details.remindersSent).toBe(1);
    expect(sub.status).toBe('active'); // unchanged
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
    const { Subscription, Tenant, BillingEvent, sendEmail } = await getMocks();
    const sub = makeSub({
      paymentOverdue: true,
      gracePeriodEndDate: new Date(Date.now() - 4 * DAY_MS), // 3+ days past grace period end
      deactivatedAt: undefined,
    });
    vi.mocked(Subscription.find).mockImplementation(mockFindSequence({ 4: [sub] }));

    const result = await processSubscriptionBilling();

    expect(result.details.accountsDeactivated).toBe(1);
    expect(sub.status).toBe('suspended');
    expect(sub.deactivatedAt).toBeInstanceOf(Date);
    expect(Tenant.findByIdAndUpdate).toHaveBeenCalledWith('tenant-1', { isActive: false });
    expect(BillingEvent.create).toHaveBeenCalledWith(
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
    const { Subscription, BillingEvent, sendEmail } = await getMocks();
    const sub = makeSub({
      paymentOverdue: true,
      nextBillingDate: new Date(Date.now() - 16 * DAY_MS),
      outstandingBalance: 0,
      lateFeeAppliedAt: undefined,
    });
    vi.mocked(Subscription.find).mockImplementation(mockFindSequence({ 5: [sub] }));

    const result = await processSubscriptionBilling();

    expect(result.details.lateFeesApplied).toBe(1);
    expect(sub.outstandingBalance).toBe(100); // 10% of 1000
    expect(sub.lateFeeAppliedAt).toBeInstanceOf(Date);
    expect(sub.billingHistory).toHaveLength(1);
    expect(sub.billingHistory[0]).toMatchObject({ amount: 100, status: 'pending' });
    expect(BillingEvent.create).toHaveBeenCalledWith(
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
    const { Subscription, BillingEvent, sendEmail } = await getMocks();
    const sub = makeSub({
      paymentOverdue: true,
      nextBillingDate: new Date(Date.now() - 31 * DAY_MS),
      outstandingBalance: 100, // e.g. a late fee already applied
      reactivationFeeAppliedAt: undefined,
    });
    vi.mocked(Subscription.find).mockImplementation(mockFindSequence({ 6: [sub] }));

    const result = await processSubscriptionBilling();

    expect(result.details.reactivationFeesApplied).toBe(1);
    expect(sub.outstandingBalance).toBe(600); // 100 existing + 500 flat reactivation fee
    expect(sub.reactivationFeeAppliedAt).toBeInstanceOf(Date);
    expect(BillingEvent.create).toHaveBeenCalledWith(
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
    const { Subscription, BillingEvent } = await getMocks();
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

    vi.mocked(BillingEvent.create).mockImplementationOnce(() => {
      throw new Error('simulated billing event failure');
    });
    vi.mocked(Subscription.find).mockImplementation(
      mockFindSequence({ 2: [failingSub, okSub] })
    );

    const result = await processSubscriptionBilling();

    expect(result.success).toBe(false);
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(result.errors.some((e) => e.includes('sub-fail'))).toBe(true);
    // The second subscription in the same batch should still be processed
    expect(result.details.overdueFlagged).toBe(1);
    expect(okSub.paymentOverdue).toBe(true);
  });
});
