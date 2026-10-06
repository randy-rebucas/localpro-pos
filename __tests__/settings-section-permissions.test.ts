import { describe, it, expect } from 'vitest';
import {
  permissionsForSettingsKey,
  settingsKeyChanges,
  settingsPermissionRequirement,
} from '@/lib/settings-section-permissions';
import { PERMISSIONS } from '@/lib/permissions';

describe('settings section permissions', () => {
  it('maps each section to its own key and everything else to settings.manage', () => {
    expect(permissionsForSettingsKey('hardwareConfig')).toEqual(['hardware.manage']);
    expect(permissionsForSettingsKey('advancedBranding')).toEqual(['branding.manage']);
    expect(permissionsForSettingsKey('multiCurrency')).toEqual(['multi_currency.manage']);
    expect(permissionsForSettingsKey('enableInventory')).toEqual(['feature_flags.manage']);
    expect(permissionsForSettingsKey('currency')).toEqual(['settings.manage', 'multi_currency.manage']);
    expect(permissionsForSettingsKey('companyName')).toEqual(['settings.manage']);
  });

  it('only uses registered permission keys', () => {
    const registered = new Set(PERMISSIONS.map((p) => p.key));
    for (const key of ['hardwareConfig', 'advancedBranding', 'multiCurrency', 'enableInventory', 'currency', 'companyName']) {
      for (const perm of permissionsForSettingsKey(key)) expect(registered.has(perm)).toBe(true);
    }
  });

  describe('settingsKeyChanges', () => {
    it('compares the flattened columns against the stored row', () => {
      const row = { printerType: 'network', printerIpAddress: '10.0.0.5', printerPortNumber: 9100, printerProfile: null, printerVendorId: null, printerProductId: null };
      expect(settingsKeyChanges('hardwareConfig', { printer: { type: 'network', ipAddress: '10.0.0.5', portNumber: 9100 } }, row)).toBe(false);
      expect(settingsKeyChanges('hardwareConfig', { printer: { type: 'network', ipAddress: '10.0.0.6', portNumber: 9100 } }, row)).toBe(true);
    });

    it('treats null and undefined as equal, and compares Decimals numerically', () => {
      expect(settingsKeyChanges('taxLabel', undefined, { taxLabel: null })).toBe(false);
      expect(settingsKeyChanges('taxRate', 12, { taxRate: { toNumber: () => 12 } })).toBe(false);
    });

    it('never counts keys that persist nothing (derived or excluded) as changed', () => {
      expect(settingsKeyChanges('suggestedCurrency', { currency: 'PHP' }, {})).toBe(false);
      expect(settingsKeyChanges('businessHours', { timezone: 'UTC' }, {})).toBe(false);
    });
  });

  describe('settingsPermissionRequirement', () => {
    const row = { companyName: 'Acme', enableInventory: true, currency: 'PHP' };

    it('requires a permission only for keys that change', () => {
      const req = settingsPermissionRequirement({ companyName: 'Acme 2', enableInventory: true, currency: 'PHP' }, row);
      expect(req.changedKeys).toEqual(['companyName']);
      expect(req.required).toEqual([['settings.manage']]);
    });

    it('falls back to the union of submitted keys when nothing changes', () => {
      const req = settingsPermissionRequirement({ enableInventory: true, currency: 'PHP' }, row);
      expect(req.changedKeys).toEqual([]);
      expect(new Set(req.anyOfWhenUnchanged)).toEqual(new Set(['feature_flags.manage', 'settings.manage', 'multi_currency.manage']));
    });

    it('requires settings.manage for an empty request', () => {
      expect(settingsPermissionRequirement({}, row).anyOfWhenUnchanged).toEqual(['settings.manage']);
    });
  });
});
