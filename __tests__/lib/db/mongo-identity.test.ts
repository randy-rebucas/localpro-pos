import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/cache', async (orig) => ({ ...(await orig<object>()), invalidateUserCache: vi.fn(), invalidateTenantCache: vi.fn() }));

import TenantModel from '@/models/Tenant';
import UserModel from '@/models/User';
import AddressModel from '@/models/Address';
import { mongoIdentityRepos as repos } from '@/lib/db/mongo/identity';

const TENANT = '64abc123def4567890abcdef';
const ID = '64abc123def4567890abc000';

function leanQuery(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'populate', 'sort', 'skip', 'limit', 'session']) q[m] = vi.fn(() => q);
  q.lean = vi.fn().mockResolvedValue(result);
  return q;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('tenants.update translates TenantUpdate ops', () => {
  async function capture(ops: Parameters<typeof repos.tenants.update>[1]) {
    const spy = vi.spyOn(TenantModel, 'findOneAndUpdate').mockReturnValue(leanQuery({ _id: TENANT }) as never);
    await repos.tenants.update(TENANT, ops);
    const [filter, update, options] = spy.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>, Record<string, unknown>];
    return { filter, update, options };
  }

  it('set / unset on top-level fields and settings paths, with validators', async () => {
    const { filter, update, options } = await capture({ set: { name: 'Acme', 'settings.timezone': 'Asia/Manila' }, unset: ['settings.logo'] });
    expect(filter).toEqual({ _id: TENANT });
    expect(update).toEqual({ $set: { name: 'Acme', 'settings.timezone': 'Asia/Manila' }, $unset: { 'settings.logo': '' } });
    expect(options).toMatchObject({ new: true, runValidators: true });
  });

  it('push and pull by id', async () => {
    const { update } = await capture({ push: { 'settings.holidays': { id: 'h1' } }, pull: { 'settings.receiptTemplates.templates': { id: 't1' } } });
    expect(update).toEqual({
      $push: { 'settings.holidays': { id: 'h1' } },
      $pull: { 'settings.receiptTemplates.templates': { id: 't1' } },
    });
  });

  it('setOnAllItems uses the all-positional operator', async () => {
    const { update } = await capture({ setOnAllItems: { path: 'settings.receiptTemplates.templates', set: { isDefault: false } } });
    expect(update).toEqual({ $set: { 'settings.receiptTemplates.templates.$[].isDefault': false } });
  });

  it('setOnItem matches the item id and uses an array filter', async () => {
    const { filter, update, options } = await capture({
      setOnItem: { path: 'settings.receiptTemplates.templates', id: 't1', set: { name: 'A' }, unset: ['footer'] },
    });
    expect(filter).toEqual({ _id: TENANT, 'settings.receiptTemplates.templates.id': 't1' });
    expect(update).toEqual({
      $set: { 'settings.receiptTemplates.templates.$[item].name': 'A' },
      $unset: { 'settings.receiptTemplates.templates.$[item].footer': '' },
    });
    expect(options.arrayFilters).toEqual([{ 'item.id': 't1' }]);
  });

  it('setOnItem.replace swaps the whole matched item', async () => {
    const { filter, update, options } = await capture({ setOnItem: { path: 'settings.holidays', id: 'h1', replace: { id: 'h1', name: 'X' } } });
    expect(filter).toEqual({ _id: TENANT, 'settings.holidays.id': 'h1' });
    expect(update).toEqual({ $set: { 'settings.holidays.$': { id: 'h1', name: 'X' } } });
    expect(options.arrayFilters).toBeUndefined();
  });

  it('returns null when nothing matched', async () => {
    vi.spyOn(TenantModel, 'findOneAndUpdate').mockReturnValue(leanQuery(null) as never);
    expect(await repos.tenants.update(TENANT, { setOnItem: { path: 'settings.holidays', id: 'nope', replace: {} } })).toBeNull();
  });
});

describe('users', () => {
  function userDoc(fields: Record<string, unknown> = {}) {
    const doc = new UserModel({ _id: ID, tenantId: TENANT, email: 'a@b.co', name: 'Ana', password: 'x'.repeat(60), ...fields });
    doc.isNew = false;
    return doc;
  }

  it('update hashes a new password (pre-save hook) and never returns it', async () => {
    const doc = userDoc();
    vi.spyOn(UserModel, 'findOne').mockResolvedValue(doc as never);
    // Run the real pre-save hooks without a database
    type Hooks = { execPre: (name: string, ctx: unknown, args: unknown[], cb: (err?: Error) => void) => void };
    const hooks = (UserModel.schema as unknown as { s: { hooks: Hooks } }).s.hooks;
    vi.spyOn(doc, 'save').mockImplementation(
      () => new Promise((resolve, reject) => hooks.execPre('save', doc, [], (err) => (err ? reject(err) : resolve(doc)))) as never
    );

    const result = await repos.users.update(ID, { password: 'new-password-123' }, { tenantId: TENANT });
    expect(result!.changed).toContain('password');
    expect(result!.after).not.toHaveProperty('password');
    expect(result!.before).not.toHaveProperty('password');
    expect(await bcrypt.compare('new-password-123', doc.password)).toBe(true);
  });

  it('update is scoped to the tenant when given', async () => {
    const spy = vi.spyOn(UserModel, 'findOne').mockResolvedValue(null as never);
    expect(await repos.users.update(ID, { name: 'X' }, { tenantId: TENANT })).toBeNull();
    expect(spy).toHaveBeenCalledWith({ _id: ID, tenantId: TENANT });
  });

  it('update applies select to the returned user', async () => {
    const doc = userDoc();
    vi.spyOn(UserModel, 'findOne').mockResolvedValue(doc as never);
    vi.spyOn(doc, 'save').mockResolvedValue(doc as never);
    const result = await repos.users.update(ID, { name: 'Bea' }, { select: 'name email' });
    expect(Object.keys(result!.after).sort()).toEqual(['_id', 'email', 'name']);
  });

  it('login lookups lowercase the email and include the hash', async () => {
    const q = leanQuery({ _id: ID, password: 'hash' });
    const spy = vi.spyOn(UserModel, 'findOne').mockReturnValue(q as never);
    const user = await repos.users.findByEmailForLogin('Ana@B.co', { tenantId: TENANT });
    expect(spy).toHaveBeenCalledWith({ email: 'ana@b.co', tenantId: TENANT });
    expect(q.select).toHaveBeenCalledWith('+password');
    expect(user!.password).toBe('hash');
  });

  it('verifyPassword compares against the stored bcrypt hash', async () => {
    const hash = await bcrypt.hash('secret-123', 4);
    const user = { _id: ID, password: hash } as never;
    expect(await repos.users.verifyPassword(user, 'secret-123')).toBe(true);
    expect(await repos.users.verifyPassword(user, 'wrong')).toBe(false);
  });

  it('delete and findInTenant are tenant-scoped', async () => {
    const del = vi.spyOn(UserModel, 'findOneAndDelete').mockResolvedValue(null as never);
    expect(await repos.users.delete(TENANT, ID)).toBe(false);
    expect(del).toHaveBeenCalledWith({ _id: ID, tenantId: TENANT });
    const find = vi.spyOn(UserModel, 'findOne').mockReturnValue(leanQuery(null) as never);
    await repos.users.findInTenant(TENANT, ID, { activeOnly: true });
    expect(find).toHaveBeenCalledWith({ _id: ID, tenantId: TENANT, isActive: true });
  });
});

describe('addresses are scoped by owner', () => {
  it('findOwned, update and softDelete filter by userId', async () => {
    const findOne = vi.spyOn(AddressModel, 'findOne').mockReturnValue(leanQuery(null) as never);
    await repos.addresses.findOwned('u1', ID);
    expect(findOne).toHaveBeenCalledWith({ _id: ID, userId: 'u1' });

    const upd = vi.spyOn(AddressModel, 'findOneAndUpdate').mockReturnValue(leanQuery(null) as never);
    await repos.addresses.update('u1', ID, { label: 'Work', state: null });
    expect(upd).toHaveBeenCalledWith({ _id: ID, userId: 'u1' }, { $set: { label: 'Work' }, $unset: { state: 1 } }, { new: true });

    findOne.mockResolvedValueOnce(null as never);
    expect(await repos.addresses.softDelete('u1', ID)).toBeNull();
    expect(findOne).toHaveBeenLastCalledWith({ _id: ID, userId: 'u1', isActive: true });
  });
});
