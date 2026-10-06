import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  PERMISSIONS,
  PERMISSION_FEATURES,
  LEGACY_PERMISSION_ALIASES,
  hasPermission,
  isKnownPermissionKey,
  normalizeOverrides,
} from '@/lib/permissions';

// hasPermission() returns false for any key it doesn't know, so an unknown key
// silently hides a sidebar link (or disables a page) for every role except
// admin/owner — and never shows up in Roles & Permissions. Known keys are the
// action keys plus the legacy umbrella aliases (which resolve as "any action").

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe('permission registry coverage', () => {
  it('every AdminSidebar permission key is known', () => {
    const src = readFileSync(join(process.cwd(), 'components/admin/AdminSidebar.tsx'), 'utf8');
    const keys = [...src.matchAll(/permission: '([\w.]+)'/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((k) => !isKnownPermissionKey(k))).toEqual([]);
  });

  it('every canAccess()/hasTenantPermission() key in app code is known', () => {
    const files = [...walk(join(process.cwd(), 'app')), ...walk(join(process.cwd(), 'components')), ...walk(join(process.cwd(), 'hooks'))];
    const unknown = new Set<string>();
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/(?:canAccess|hasTenantPermission)\([^)]*?'([a-z_]+\.[a-z_]+)'/g)) {
        if (!isKnownPermissionKey(m[1])) unknown.add(`${m[1]} (${file.replace(process.cwd(), '')})`);
      }
    }
    expect([...unknown]).toEqual([]);
  });

  it('API routes check action keys, not pre-split umbrella keys', () => {
    const routes = walk(join(process.cwd(), 'app/api')).filter((f) => f.endsWith('route.ts'));
    const umbrella = new Set<string>();
    for (const file of routes) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/'([a-z_]+\.[a-z_]+)'/g)) {
        if (m[1] in LEGACY_PERMISSION_ALIASES) umbrella.add(`${m[1]} (${file.replace(process.cwd(), '')})`);
      }
    }
    expect([...umbrella]).toEqual([]);
  });
});

describe('permission tree', () => {
  it('has unique action keys and no feature without a grantable action', () => {
    const keys = PERMISSIONS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const f of PERMISSION_FEATURES) {
      expect(f.actions.some((a) => !a.locked)).toBe(true);
    }
  });

  it('holidays actions default to a manager floor and are individually overridable', () => {
    expect(hasPermission('manager', 'holidays.create', null)).toBe(true);
    expect(hasPermission('cashier', 'holidays.create', null)).toBe(false);
    expect(hasPermission('cashier', 'holidays.delete', { cashier: { 'holidays.delete': true } })).toBe(true);
    expect(hasPermission('cashier', 'holidays.create', { cashier: { 'holidays.delete': true } })).toBe(false);
  });

  it('locked actions are always granted and ignore overrides', () => {
    expect(hasPermission('viewer', 'products.view', null)).toBe(true);
    expect(hasPermission('viewer', 'products.view', { viewer: { 'products.view': false } })).toBe(true);
  });

  it('a stored override on a legacy umbrella key still applies to each of its actions', () => {
    const legacy = { manager: { 'products.manage': false } };
    for (const key of ['products.create', 'products.edit', 'products.delete', 'products.restock']) {
      expect(hasPermission('manager', key, legacy)).toBe(false);
    }
    // An action's own override wins over the legacy one.
    expect(hasPermission('manager', 'products.delete', { manager: { 'products.manage': false, 'products.delete': true } })).toBe(true);
  });

  it('a legacy umbrella key resolves to "any of its actions"', () => {
    expect(hasPermission('cashier', 'products.manage', null)).toBe(false);
    expect(hasPermission('cashier', 'products.manage', { cashier: { 'products.restock': true } })).toBe(true);
  });

  it('defaults reproduce the pre-split floors', () => {
    // products.manage was manager+; customers.manage (create) cashier+; customers.edit manager+.
    expect(hasPermission('manager', 'products.delete', null)).toBe(true);
    expect(hasPermission('cashier', 'products.delete', null)).toBe(false);
    expect(hasPermission('cashier', 'customers.create', null)).toBe(true);
    expect(hasPermission('cashier', 'customers.update', null)).toBe(false);
    expect(hasPermission('manager', 'customers.delete', null)).toBe(true);
  });

  it('normalizeOverrides expands legacy keys, keeps own overrides, and drops junk', () => {
    const normalized = normalizeOverrides({
      manager: { 'products.manage': false, 'products.delete': true, 'bogus.key': true, 'products.view': false },
      cashier: { 'customers.edit': true },
      admin: { 'products.create': false },
    });
    expect(normalized).toEqual({
      manager: { 'products.create': false, 'products.edit': false, 'products.delete': true, 'products.restock': false },
      cashier: { 'customers.update': true, 'customers.delete': true },
    });
  });

  it('normalizeOverrides skips expanded values that equal the action default', () => {
    // manager already has products.* by default — a legacy `true` adds nothing.
    expect(normalizeOverrides({ manager: { 'products.manage': true } })).toEqual({});
  });

  it('normalizing preserves effective permissions for every role and action', () => {
    const stored = {
      viewer: { 'bookings.manage': true, 'tables.configure': true },
      cashier: { 'products.manage': true, 'customers.edit': true, 'ledger.view': true },
      manager: { 'users.manage': false, 'subscriptions.manage': true, 'expenses.delete': false },
    };
    const normalized = normalizeOverrides(stored);
    for (const role of ['viewer', 'cashier', 'manager']) {
      for (const p of PERMISSIONS) {
        expect([role, p.key, hasPermission(role, p.key, normalized)]).toEqual([role, p.key, hasPermission(role, p.key, stored)]);
      }
    }
  });
});
