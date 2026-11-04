/**
 * Tenant scoping of the Mongo lookup repositories: every tenant-scoped method
 * must put the caller's tenantId into the filter it sends to Mongo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

const METHODS = [
  'find',
  'findOne',
  'findById',
  'create',
  'countDocuments',
  'updateMany',
  'updateOne',
  'deleteOne',
  'findOneAndUpdate',
  'findByIdAndUpdate',
  'findByIdAndDelete',
] as const;

/** A query stub: chain methods return itself, lean() resolves to `result`. */
function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ['populate', 'sort', 'select', 'skip', 'limit']) q[m] = vi.fn(() => q);
  q.lean = vi.fn().mockResolvedValue(result);
  return q;
}

function modelMock() {
  const model: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of METHODS) model[m] = vi.fn();
  model.find.mockImplementation(() => query([]));
  model.findOne.mockImplementation(() => query(null));
  model.findOneAndUpdate.mockImplementation(() => query({ _id: 'x' }));
  model.findByIdAndUpdate.mockImplementation(() => query(null));
  model.findByIdAndDelete.mockImplementation(() => query(null));
  model.countDocuments.mockResolvedValue(0);
  model.updateMany.mockResolvedValue({ modifiedCount: 0 });
  model.updateOne.mockResolvedValue({ modifiedCount: 1 });
  model.deleteOne.mockResolvedValue({ deletedCount: 1 });
  model.create.mockImplementation(async (doc: unknown) => doc);
  return model;
}

const models = vi.hoisted(() => ({}) as Record<string, Record<string, ReturnType<typeof vi.fn>>>);
for (const name of ['Category', 'Branch', 'Device', 'Table', 'Expense', 'Discount', 'Coupon', 'FeatureFlagOverride', 'LoyaltyConfig']) {
  vi.doMock(`@/models/${name}`, () => {
    models[name] = modelMock();
    return { default: models[name] };
  });
}

const TENANT = '64abc123def4567890abcdef';
const ID = '64abc123def4567890abc000';
const now = new Date();

/** First argument of every call made on the model. */
function filters(model: string) {
  return Object.values(models[model]).flatMap((fn) => fn.mock.calls.map((c) => c[0]));
}

/** update() loads the document first; resolve that read to "not found". */
function notFound(model: string) {
  models[model].findOne.mockResolvedValueOnce(null);
  return true;
}

let repos: typeof import('@/lib/db/mongo/lookup').mongoLookupRepos;

beforeEach(async () => {
  repos = (await import('@/lib/db/mongo/lookup')).mongoLookupRepos;
  for (const model of Object.values(models)) for (const fn of Object.values(model)) fn.mockClear();
});

const cases: Array<[string, string, () => Promise<unknown>]> = [
  ['Category', 'categories.list', () => repos.categories.list(TENANT)],
  ['Category', 'categories.findById', () => repos.categories.findById(TENANT, ID, { activeOnly: true })],
  ['Category', 'categories.findByName', () => repos.categories.findByName(TENANT, 'Drinks')],
  ['Category', 'categories.create', () => repos.categories.create(TENANT, { name: 'x' })],
  ['Category', 'categories.update', () => notFound('Category') && repos.categories.update(TENANT, ID, { name: 'x' })],
  ['Branch', 'branches.list', () => repos.branches.list(TENANT, { isActive: true })],
  ['Branch', 'branches.findById', () => repos.branches.findById(TENANT, ID)],
  ['Branch', 'branches.findByIdWithManager', () => repos.branches.findByIdWithManager(TENANT, ID)],
  ['Branch', 'branches.listActive', () => repos.branches.listActive(TENANT)],
  ['Branch', 'branches.countActive', () => repos.branches.countActive(TENANT)],
  ['Branch', 'branches.create', () => repos.branches.create(TENANT, { name: 'x' })],
  ['Branch', 'branches.update', () => notFound('Branch') && repos.branches.update(TENANT, ID, { name: 'x' })],
  ['Device', 'devices.list', () => repos.devices.list(TENANT)],
  ['Device', 'devices.findById', () => repos.devices.findById(TENANT, ID)],
  ['Device', 'devices.create', () => repos.devices.create(TENANT, { label: 'a', serialNumber: 'b', terminalId: 'c', registeredBy: ID })],
  ['Device', 'devices.update', () => notFound('Device') && repos.devices.update(TENANT, ID, { label: 'x' })],
  ['Table', 'tables.list', () => repos.tables.list(TENANT, { status: 'open' })],
  ['Table', 'tables.findById', () => repos.tables.findById(TENANT, ID)],
  ['Table', 'tables.create', () => repos.tables.create(TENANT, { name: 'T1' })],
  ['Table', 'tables.update', () => notFound('Table') && repos.tables.update(TENANT, ID, { name: 'x' })],
  ['Expense', 'expenses.list', () => repos.expenses.list(TENANT, { from: now, to: now, name: 'x' })],
  ['Expense', 'expenses.findById', () => repos.expenses.findById(TENANT, ID)],
  ['Expense', 'expenses.findByIdWithUser', () => repos.expenses.findByIdWithUser(TENANT, ID)],
  ['Expense', 'expenses.create', () => repos.expenses.create(TENANT, { name: 'a', description: 'b', amount: 1, paymentMethod: 'cash', userId: ID })],
  ['Expense', 'expenses.update', () => notFound('Expense') && repos.expenses.update(TENANT, ID, { name: 'x' })],
  ['Expense', 'expenses.softDelete', () => repos.expenses.softDelete(TENANT, ID)],
  ['Expense', 'expenses.listCashBetween', () => repos.expenses.listCashBetween(TENANT, now, now)],
  ['Discount', 'discounts.list', () => repos.discounts.list(TENANT, { code: 'x', activeAt: now })],
  ['Discount', 'discounts.findById', () => repos.discounts.findById(TENANT, ID)],
  ['Discount', 'discounts.findByCode', () => repos.discounts.findByCode(TENANT, 'sc20', { activeOnly: true })],
  ['Discount', 'discounts.findValidByCodePrefix', () => repos.discounts.findValidByCodePrefix(TENANT, 'LOYALTY-', now)],
  ['Discount', 'discounts.create', () => repos.discounts.create(TENANT, { code: 'X', type: 'fixed', value: 1, validFrom: now, validUntil: now })],
  ['Discount', 'discounts.createIfMissing', () => repos.discounts.createIfMissing(TENANT, { code: 'X', type: 'fixed', value: 1, validFrom: now, validUntil: now })],
  ['Discount', 'discounts.update', () => notFound('Discount') && repos.discounts.update(TENANT, ID, { value: 1 })],
  ['Discount', 'discounts.delete', () => repos.discounts.delete(TENANT, ID)],
  ['Discount', 'discounts.activateDue', () => repos.discounts.activateDue(TENANT, { now, validFromAfter: now, withDocs: true })],
  ['Discount', 'discounts.deactivateDue', () => repos.discounts.deactivateDue(TENANT, { now, withDocs: true })],
  ['Discount', 'discounts.listLimitedUsedSince', () => repos.discounts.listLimitedUsedSince(TENANT, now)],
  ['Discount', 'discounts.statusCounts', () => repos.discounts.statusCounts(TENANT, now)],
  ['FeatureFlagOverride', 'featureFlagOverrides.list', () => repos.featureFlagOverrides.list(TENANT)],
  ['FeatureFlagOverride', 'featureFlagOverrides.upsert', () => repos.featureFlagOverrides.upsert(TENANT, 'f', { enabled: true, grantedBy: ID })],
  ['FeatureFlagOverride', 'featureFlagOverrides.delete', () => repos.featureFlagOverrides.delete(TENANT, 'f')],
  ['LoyaltyConfig', 'loyaltyConfigs.get', () => repos.loyaltyConfigs.get(TENANT)],
  ['LoyaltyConfig', 'loyaltyConfigs.upsert', () => repos.loyaltyConfigs.upsert(TENANT, { pointsPerPeso: 2 })],
];

describe('mongo lookup repositories scope every query to the tenant', () => {
  it.each(cases)('%s %s', async (model, _name, call) => {
    await call();
    const sent = filters(model);
    expect(sent.length).toBeGreaterThan(0);
    for (const filter of sent) {
      expect(filter).toMatchObject({ tenantId: TENANT });
    }
  });

  it('create() cannot be redirected to another tenant by the input', async () => {
    await repos.categories.create(TENANT, { name: 'x', tenantId: 'other' } as never);
    expect(models.Category.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT }));
  });

  it('statusCounts(null) is the only cross-tenant discount query', async () => {
    await repos.discounts.statusCounts(null, now);
    for (const filter of filters('Discount')) expect(filter).not.toHaveProperty('tenantId');
  });
});

describe('mongo lookup repositories: query details', () => {
  it('discount codes are matched uppercase', async () => {
    await repos.discounts.findByCode(TENANT, 'sc20');
    expect(models.Discount.findOne).toHaveBeenCalledWith({ tenantId: TENANT, code: 'SC20' });
  });

  it('category name lookup is case-insensitive and regex-escaped', async () => {
    await repos.categories.findByName(TENANT, ' a.b ');
    const filter = models.Category.findOne.mock.calls[0][0];
    expect(filter.name.$regex.source).toBe('^a\\.b$');
    expect(filter.name.$regex.flags).toBe('i');
  });

  it('coupon incrementUsage enforces maxUses in the filter and reports a miss', async () => {
    models.Coupon.updateOne.mockResolvedValueOnce({ modifiedCount: 0 });
    expect(await repos.coupons.incrementUsage(ID)).toBe(false);
    expect(models.Coupon.updateOne.mock.calls[0][0]).toHaveProperty('$or');
  });

  it('discount activation reads first and updates by id only when docs are wanted', async () => {
    await repos.discounts.activateDue(TENANT, { now, validFromAfter: now, withDocs: false });
    expect(models.Discount.find).not.toHaveBeenCalled();
    expect(models.Discount.updateMany.mock.calls[0][0]).not.toHaveProperty('_id');
  });
});
