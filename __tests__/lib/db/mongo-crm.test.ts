/**
 * Mongo CRM repositories: tenant scoping, CustomerFilter translation, the
 * atomic balance/claim writes and the uncast aggregate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

import CustomerModel from '@/models/Customer';
import CustomerBalancePaymentModel from '@/models/CustomerBalancePayment';
import LoyaltyTransactionModel from '@/models/LoyaltyTransaction';
import CampaignModel from '@/models/Campaign';
import { mongoCrmRepos as repos } from '@/lib/db/mongo/crm';

const TENANT = '64abc123def4567890abcdef';
const ID = '64abc123def4567890abc000';

function leanQuery(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'populate', 'sort', 'skip', 'limit', 'session']) q[m] = vi.fn(() => q);
  q.lean = vi.fn().mockResolvedValue(result);
  return q;
}

const lastArgs = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls[spy.mock.calls.length - 1];

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('CRM methods scope by tenant', () => {
  it('customers, payments, loyalty and campaigns', async () => {
    const custFind = vi.spyOn(CustomerModel, 'find').mockReturnValue(leanQuery([]) as never);
    const custOne = vi.spyOn(CustomerModel, 'findOne').mockReturnValue(leanQuery(null) as never);
    const custCount = vi.spyOn(CustomerModel, 'countDocuments').mockResolvedValue(0 as never);
    const custInc = vi.spyOn(CustomerModel, 'updateOne').mockResolvedValue({} as never);
    const payFind = vi.spyOn(CustomerBalancePaymentModel, 'find').mockReturnValue(leanQuery([]) as never);
    const payOne = vi.spyOn(CustomerBalancePaymentModel, 'findOne').mockReturnValue(leanQuery(null) as never);
    const loyFind = vi.spyOn(LoyaltyTransactionModel, 'find').mockReturnValue(leanQuery([]) as never);
    const loyCount = vi.spyOn(LoyaltyTransactionModel, 'countDocuments').mockResolvedValue(0 as never);
    const campFind = vi.spyOn(CampaignModel, 'find').mockReturnValue(leanQuery([]) as never);
    const campClaim = vi.spyOn(CampaignModel, 'findOneAndUpdate').mockReturnValue(leanQuery(null) as never);

    await repos.customers.list(TENANT, { search: 'ann' });
    await repos.customers.count(TENANT);
    await repos.customers.findOne(TENANT, { email: 'A@B.C' });
    await repos.customers.findById(TENANT, ID);
    await repos.customers.adjustAccountBalance(TENANT, ID, -5);
    await repos.balancePayments.list(TENANT, ID, { limit: 20 });
    await repos.balancePayments.findByIdempotencyKey(TENANT, 'k1');
    await repos.loyaltyTransactions.list(TENANT, ID, { page: { skip: 0, limit: 10 } });
    await repos.loyaltyTransactions.count(TENANT, ID);
    await repos.campaigns.list(TENANT, { limit: 50 });
    await repos.campaigns.claimForSending(TENANT, ID);

    for (const spy of [custFind, custOne, custCount, custInc, payFind, payOne, loyFind, loyCount, campFind, campClaim]) {
      for (const [filter] of spy.mock.calls) expect(filter).toMatchObject({ tenantId: TENANT });
    }
  });

  it('creates cannot be redirected to another tenant by the input', async () => {
    const cust = vi.spyOn(CustomerModel, 'create').mockResolvedValue({ _id: ID } as never);
    const pay = vi.spyOn(CustomerBalancePaymentModel, 'create').mockResolvedValue([{ _id: ID }] as never);
    await repos.customers.create(TENANT, { firstName: 'A', lastName: 'B', tenantId: 'other' } as never);
    await repos.balancePayments.create(TENANT, { customerId: ID, amount: 1, method: 'cash', tenantId: 'other' } as never);
    expect(cust.mock.calls[0][0]).toMatchObject({ tenantId: TENANT });
    expect((pay.mock.calls[0][0] as unknown as Record<string, unknown>[])[0]).toMatchObject({ tenantId: TENANT });
  });
});

describe('CustomerFilter translation', () => {
  async function query(filter: Parameters<typeof repos.customers.list>[1]) {
    const spy = vi.spyOn(CustomerModel, 'find').mockReturnValue(leanQuery([]) as never);
    await repos.customers.list(TENANT, filter);
    return lastArgs(spy)[0] as Record<string, unknown>;
  }

  it('search is regex-escaped over name, email and phone', async () => {
    const q = await query({ search: 'a+b' });
    const regex = { $regex: 'a\\+b', $options: 'i' };
    expect(q.$or).toEqual([{ firstName: regex }, { lastName: regex }, { email: regex }, { phone: regex }]);
  });

  it('email is lowercased; contact and points conditions', async () => {
    expect(await query({ email: ' Ann@X.com ', hasContact: 'phone', minLoyaltyPoints: 100 })).toEqual({
      tenantId: TENANT,
      email: 'ann@x.com',
      phone: { $exists: true, $ne: '' },
      loyaltyPointsBalance: { $gte: 100 },
    });
  });

  it('isActive is exact; notDisabled tolerates a missing flag', async () => {
    expect((await query({ isActive: false })).isActive).toBe(false);
    expect((await query({ notDisabled: true })).isActive).toEqual({ $ne: false });
  });
});

describe('writes', () => {
  it('adjustAccountBalance is an atomic increment', async () => {
    const spy = vi.spyOn(CustomerModel, 'updateOne').mockResolvedValue({} as never);
    await repos.customers.adjustAccountBalance(TENANT, ID, -12.5);
    expect(spy.mock.calls[0].slice(0, 2)).toEqual([{ _id: ID, tenantId: TENANT }, { $inc: { accountBalance: -12.5 } }]);
  });

  it('claimForSending only matches draft or failed campaigns', async () => {
    const spy = vi.spyOn(CampaignModel, 'findOneAndUpdate').mockReturnValue(leanQuery(null) as never);
    expect(await repos.campaigns.claimForSending(TENANT, ID)).toBeNull();
    expect(spy.mock.calls[0].slice(0, 2)).toEqual([
      { _id: ID, tenantId: TENANT, status: { $in: ['draft', 'failed'] } },
      { $set: { status: 'sent' } },
    ]);
  });

  it('loyaltyStats casts the tenant id for the aggregate', async () => {
    const spy = vi.spyOn(CustomerModel, 'aggregate').mockResolvedValue([{ enrolledCount: 3, totalPoints: 90 }] as never);
    expect(await repos.customers.loyaltyStats(TENANT)).toEqual({ enrolledCount: 3, totalPoints: 90 });
    const match = (spy.mock.calls[0][0] as unknown as Array<{ $match?: { tenantId: unknown } }>)[0].$match!;
    expect(match.tenantId).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(String(match.tenantId)).toBe(TENANT);
  });

  it('loyaltyStats reports zeros when nobody has points', async () => {
    vi.spyOn(CustomerModel, 'aggregate').mockResolvedValue([] as never);
    expect(await repos.customers.loyaltyStats(TENANT)).toEqual({ enrolledCount: 0, totalPoints: 0 });
  });
});
