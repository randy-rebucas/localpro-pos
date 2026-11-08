import { describe, it, expect } from 'vitest';
import { canEditRoleOverrides, findForbiddenOverrideChanges } from '@/lib/permissions';

describe('canEditRoleOverrides', () => {
  it('lets owner/admin edit every overridable role', () => {
    for (const editor of ['owner', 'admin', 'super_admin']) {
      for (const role of ['viewer', 'cashier', 'manager']) expect(canEditRoleOverrides(editor, role)).toBe(true);
    }
  });

  it('lets a manager edit only roles below their own', () => {
    expect(canEditRoleOverrides('manager', 'viewer')).toBe(true);
    expect(canEditRoleOverrides('manager', 'cashier')).toBe(true);
    expect(canEditRoleOverrides('manager', 'manager')).toBe(false);
    expect(canEditRoleOverrides('cashier', 'cashier')).toBe(false);
  });
});

describe('findForbiddenOverrideChanges', () => {
  it('allows anything for admins', () => {
    expect(findForbiddenOverrideChanges('admin', {}, { manager: { 'reset_collections.manage': true } })).toEqual([]);
  });

  it('stops a manager raising their own role', () => {
    const out = findForbiddenOverrideChanges('manager', {}, { manager: { 'reset_collections.manage': true } });
    expect(out).toEqual([{ role: 'manager', key: 'reset_collections.manage', reason: 'rank' }]);
  });

  it('stops a manager handing out access they do not hold', () => {
    const out = findForbiddenOverrideChanges('manager', {}, { cashier: { 'tax_rules.manage': true } });
    expect(out).toEqual([{ role: 'cashier', key: 'tax_rules.manage', reason: 'grant' }]);
  });

  it('lets a manager grant what they hold and revoke from lower roles', () => {
    const out = findForbiddenOverrideChanges('manager', {}, {
      cashier: { 'products.manage': true, 'transactions.view': false },
      viewer: { 'dashboard.view': false },
    });
    expect(out).toEqual([]);
  });

  it('ignores unchanged overrides already saved by an admin', () => {
    const saved = { manager: { 'roles_permissions.manage': true, 'reset_collections.manage': true }, cashier: { 'tax_rules.manage': true } };
    expect(findForbiddenOverrideChanges('manager', saved, saved)).toEqual([]);
  });

  it('lets a manager take back a grant from a lower role', () => {
    const prev = { cashier: { 'tax_rules.manage': true } };
    expect(findForbiddenOverrideChanges('manager', prev, {})).toEqual([]);
  });
});
