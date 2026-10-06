import { describe, it, expect } from 'vitest';
import {
  flattenSettingsForPrisma,
  flattenHardwareConfig,
  reshapeHardwareConfig,
} from '@/lib/tenant-settings-flatten';

describe('hardwareConfig ↔ tenant_settings columns', () => {
  const config = {
    printer: { type: 'network', ipAddress: '192.168.1.50', portNumber: 9100 },
    barcodeScanner: { type: 'keyboard', enabled: true },
    qrReader: { enabled: false },
    cashDrawer: { enabled: true, connectedToPrinter: true, direct: { type: 'usb' } },
    touchscreen: { enabled: true },
  };

  it('persists the nested hardwareConfig the admin page sends (it used to be dropped)', () => {
    const flat = flattenSettingsForPrisma({ hardwareConfig: config });
    expect(flat).toMatchObject({
      printerType: 'network',
      printerIpAddress: '192.168.1.50',
      printerPortNumber: 9100,
      barcodeScannerEnabled: true,
      qrReaderEnabled: false,
      cashDrawerEnabled: true,
      cashDrawerConnectedToPrinter: true,
      touchscreenEnabled: true,
    });
    expect(flat).not.toHaveProperty('hardwareConfig');
  });

  it('clears columns for fields removed from a present sub-object', () => {
    const flat = flattenHardwareConfig({ printer: { type: 'browser' } });
    expect(flat).toMatchObject({ printerType: 'browser', printerIpAddress: null, printerPortNumber: null });
  });

  it('leaves columns untouched for absent sub-objects', () => {
    const flat = flattenHardwareConfig({ touchscreen: { enabled: false } });
    expect(Object.keys(flat)).toEqual(['touchscreenEnabled']);
  });

  it('rebuilds hardwareConfig from the flat row and strips the flat columns', () => {
    const row = { currency: 'PHP', ...flattenHardwareConfig(config) };
    const shaped = reshapeHardwareConfig(row);
    expect(shaped.currency).toBe('PHP');
    expect(shaped).not.toHaveProperty('printerIpAddress');
    expect(shaped.hardwareConfig).toEqual({
      printer: { type: 'network', ipAddress: '192.168.1.50', portNumber: 9100 },
      barcodeScanner: { type: 'keyboard', enabled: true },
      qrReader: { enabled: false },
      cashDrawer: { enabled: true, connectedToPrinter: true },
      touchscreen: { enabled: true },
    });
  });

  it('returns an empty hardwareConfig for a tenant with nothing configured', () => {
    expect(reshapeHardwareConfig({ currency: 'PHP' }).hardwareConfig).toEqual({});
  });
});
