import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { HardwareConfig } from '@/lib/hardware';
import {
  resolveHardwareConfig,
  readLocalHardwareConfig,
  isEmptyHardwareConfig,
  hardwareConfigStorageKey,
} from '@/lib/hardware-helpers';

const server: HardwareConfig = {
  printer: { type: 'network', ipAddress: '10.0.0.5', portNumber: 9100 },
  cashDrawer: { enabled: true, connectedToPrinter: false },
};

const local: HardwareConfig = {
  printer: { type: 'browser' },
  cashDrawer: { enabled: true, connectedToPrinter: false, direct: { type: 'usb', vendorId: 1, productId: 2 } },
};

describe('resolveHardwareConfig', () => {
  it('uses the tenant config over a stale browser cache', () => {
    expect(resolveHardwareConfig(server, local).printer).toEqual(server.printer);
  });

  it('keeps the per-device drawer pairing from the browser cache', () => {
    expect(resolveHardwareConfig(server, local).cashDrawer).toEqual({
      enabled: true,
      connectedToPrinter: false,
      direct: { type: 'usb', vendorId: 1, productId: 2 },
    });
  });

  it('falls back to the browser cache when nothing is saved server-side', () => {
    expect(resolveHardwareConfig({}, local)).toEqual(local);
    expect(resolveHardwareConfig(undefined, local)).toEqual(local);
  });

  it('returns an empty config when neither exists', () => {
    expect(resolveHardwareConfig(undefined, null)).toEqual({});
  });
});

// __tests__/setup.ts replaces localStorage with vi.fn() stubs, so drive getItem directly.
describe('readLocalHardwareConfig', () => {
  const getItem = vi.mocked(localStorage.getItem);
  beforeEach(() => getItem.mockReset());

  it('reads and parses the per-tenant cache', () => {
    getItem.mockImplementation((key) => (key === hardwareConfigStorageKey('acme') ? JSON.stringify(local) : null));
    expect(readLocalHardwareConfig('acme')).toEqual(local);
    expect(readLocalHardwareConfig('other')).toBeNull();
  });

  it('treats corrupt JSON as no cache', () => {
    getItem.mockReturnValue('{not json');
    expect(readLocalHardwareConfig('acme')).toBeNull();
  });
});

describe('isEmptyHardwareConfig', () => {
  it('detects empty configs', () => {
    expect(isEmptyHardwareConfig(undefined)).toBe(true);
    expect(isEmptyHardwareConfig({})).toBe(true);
    expect(isEmptyHardwareConfig(server)).toBe(false);
  });
});
