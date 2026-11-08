import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/models/User', () => ({
  default: { exists: vi.fn() },
}));

import User from '@/models/User';
import { normalizeBranchCode, resolveBranchManager } from '@/lib/branch-manager';

const TENANT = '64b000000000000000000001';
const USER = '64b0000000000000000000aa';
const exists = User.exists as unknown as ReturnType<typeof vi.fn>;

describe('resolveBranchManager', () => {
  beforeEach(() => exists.mockReset());

  it('leaves the field alone when no manager is sent', async () => {
    expect(await resolveBranchManager(undefined, TENANT)).toEqual({ ok: true, value: undefined });
    expect(exists).not.toHaveBeenCalled();
  });

  it('clears the manager for null or an empty string', async () => {
    expect(await resolveBranchManager(null, TENANT)).toEqual({ ok: true, value: null });
    expect(await resolveBranchManager('', TENANT)).toEqual({ ok: true, value: null });
  });

  it('rejects ids that are not ObjectIds without querying', async () => {
    expect(await resolveBranchManager('not-an-id', TENANT)).toEqual({ ok: false });
    expect(await resolveBranchManager({ $ne: null }, TENANT)).toEqual({ ok: false });
    expect(exists).not.toHaveBeenCalled();
  });

  it('accepts a user of the same tenant, scoping the lookup by tenant', async () => {
    exists.mockResolvedValue({ _id: USER });
    expect(await resolveBranchManager(USER, TENANT)).toEqual({ ok: true, value: USER });
    expect(exists).toHaveBeenCalledWith({ _id: USER, tenantId: TENANT });
  });

  it('rejects a user from another tenant', async () => {
    exists.mockResolvedValue(null);
    expect(await resolveBranchManager(USER, TENANT)).toEqual({ ok: false });
  });
});

describe('normalizeBranchCode', () => {
  it('keeps undefined, trims, and turns blank or non-string codes into null', () => {
    expect(normalizeBranchCode(undefined)).toBeUndefined();
    expect(normalizeBranchCode('  br01 ')).toBe('br01');
    expect(normalizeBranchCode('   ')).toBeNull();
    expect(normalizeBranchCode('')).toBeNull();
    expect(normalizeBranchCode(null)).toBeNull();
    expect(normalizeBranchCode(42)).toBeNull();
  });
});
