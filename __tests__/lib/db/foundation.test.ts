import { describe, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';
import { toApi, toApiList, toApiOrNull } from '@/lib/db/mongo/serialize';
import { DuplicateKeyError, isDuplicateKeyError, toDbError } from '@/lib/db/errors';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

import { applyPatch, run } from '@/lib/db/mongo/helpers';
import CategoryModel from '@/models/Category';
import BranchModel from '@/models/Branch';

const hex = '64abc123def4567890abcdef';

describe('toApi', () => {
  it('turns ObjectIds into hex strings at any depth and drops __v', () => {
    const date = new Date('2026-01-01T00:00:00Z');
    const out = toApi<Record<string, unknown>>({
      _id: new mongoose.Types.ObjectId(hex),
      __v: 3,
      createdAt: date,
      managerId: { _id: new mongoose.Types.ObjectId(hex), name: 'Ana' },
      planIds: [new mongoose.Types.ObjectId(hex)],
    });
    expect(out).toEqual({ _id: hex, createdAt: date, managerId: { _id: hex, name: 'Ana' }, planIds: [hex] });
    expect(out.createdAt).toBeInstanceOf(Date);
  });

  it('serializes hydrated documents through toObject', () => {
    const doc = new CategoryModel({ _id: hex, tenantId: hex, name: 'Drinks' });
    expect(toApi(doc)).toMatchObject({ _id: hex, tenantId: hex, name: 'Drinks', isActive: true });
  });

  it('keeps the JSON output identical to the Mongoose document', () => {
    const doc = new BranchModel({ tenantId: hex, name: 'Main', address: { city: 'Manila' } });
    const { __v, ...expected } = JSON.parse(JSON.stringify(doc.toObject()));
    expect(JSON.parse(JSON.stringify(toApi(doc)))).toEqual(expected);
  });

  it('handles null and lists', () => {
    expect(toApiOrNull(null)).toBeNull();
    expect(toApiList([{ _id: new mongoose.Types.ObjectId(hex) }])).toEqual([{ _id: hex }]);
  });
});

describe('duplicate-key errors', () => {
  it('recognizes Mongo 11000, Postgres 23505 (also wrapped by drizzle) and DuplicateKeyError', () => {
    expect(isDuplicateKeyError({ code: 11000 })).toBe(true);
    expect(isDuplicateKeyError({ code: '23505' })).toBe(true);
    expect(isDuplicateKeyError({ cause: { code: '23505' } })).toBe(true);
    expect(isDuplicateKeyError(new DuplicateKeyError())).toBe(true);
    expect(isDuplicateKeyError(new Error('boom'))).toBe(false);
    expect(isDuplicateKeyError(null)).toBe(false);
  });

  it('run() rethrows duplicate-key errors as DuplicateKeyError and passes others through', async () => {
    const dup = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    await expect(run(() => Promise.reject(dup))).rejects.toBeInstanceOf(DuplicateKeyError);
    const other = new Error('other');
    await expect(run(() => Promise.reject(other))).rejects.toBe(other);
    expect(toDbError(other)).toBe(other);
  });
});

describe('applyPatch', () => {
  function category(fields: Record<string, unknown> = {}) {
    const doc = new CategoryModel({ _id: hex, tenantId: hex, name: 'Drinks', description: 'Cold', ...fields });
    const save = vi.spyOn(doc, 'save').mockResolvedValue(doc);
    return { doc, save };
  }

  it('applies schema setters, reports changed fields and saves', async () => {
    const { doc, save } = category();
    const result = await applyPatch<{ name: string; description?: string }>(doc, { name: '  Juices  ' });
    expect(result.changed).toEqual(['name']);
    expect(result.before.name).toBe('Drinks');
    expect(result.after.name).toBe('Juices'); // trim setter ran
    expect(save).toHaveBeenCalledOnce();
  });

  it('skips the write when nothing changed', async () => {
    const { doc, save } = category();
    const result = await applyPatch(doc, { name: 'Drinks', isActive: true, description: undefined });
    expect(result.changed).toEqual([]);
    expect(save).not.toHaveBeenCalled();
  });

  it('clears a field when the patch value is null', async () => {
    const { doc } = category();
    const result = await applyPatch<{ description?: string }>(doc, { description: null });
    expect(result.changed).toEqual(['description']);
    expect(result.after.description).toBeUndefined();
  });

  it('passes the transaction session to save', async () => {
    const { doc, save } = category();
    const session = {} as mongoose.ClientSession;
    await applyPatch(doc, { name: 'Other' }, session);
    expect(save).toHaveBeenCalledWith({ session });
  });
});

describe('handleApiError with repository errors', () => {
  it('maps DuplicateKeyError to the same 400 DUPLICATE_KEY response as a raw Mongo 11000', async () => {
    const { handleApiError } = await import('@/lib/error-handler');
    const raw = Object.assign(new Error('E11000'), { code: 11000, keyPattern: { slug: 1 } });
    const wrapped = toDbError(raw) as DuplicateKeyError;
    expect(wrapped.field).toBe('slug');
    for (const err of [raw, wrapped]) {
      const res = handleApiError(err);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'slug already exists', code: 'DUPLICATE_KEY' });
    }
  });

  it('reads the field from a Postgres unique-violation detail, skipping the tenant key', () => {
    const pg = { code: '23505', detail: 'Key (tenant_id, sku)=(a, b) already exists.' };
    expect(new DuplicateKeyError('dup', pg).field).toBe('sku');
    expect(new DuplicateKeyError('dup', { code: '23505', detail: 'Key (slug)=(x) already exists.' }).field).toBe('slug');
  });

  it('skips tenantId in a compound Mongo key pattern', () => {
    const raw = { code: 11000, keyPattern: { tenantId: 1, barcode: 1 } };
    expect(new DuplicateKeyError('dup', raw).field).toBe('barcode');
  });
});
