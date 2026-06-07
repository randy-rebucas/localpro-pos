import { describe, expect, it } from 'vitest';
import { findProfileByUsbIds } from '@/lib/hardware/printer-profiles';
import {
  recommendPrinterSetup,
  printerConfigFromDetected,
  type DetectedPrinter,
} from '@/lib/hardware/device-detector';

describe('findProfileByUsbIds', () => {
  it('matches exact Epson TM-T88 VID/PID', () => {
    const profile = findProfileByUsbIds(0x04b8, 0x0202);
    expect(profile?.id).toBe('epson-tm-t88');
  });

  it('matches Star vendor with exact product', () => {
    const profile = findProfileByUsbIds(0x0519, 0x0003);
    expect(profile?.id).toBe('star-tsp100');
  });

  it('falls back to generic for unknown VID/PID', () => {
    const profile = findProfileByUsbIds(0xffff, 0x0001);
    expect(profile?.id).toBe('generic-usb');
  });

  it('matches Xprinter XP-58C (OC-T80A) VID/PID', () => {
    const profile = findProfileByUsbIds(0x0483, 0x070b);
    expect(profile?.id).toBe('xprinter-xp-58c');
  });

  it('matches Xprinter 58mm alternate USB ID', () => {
    const profile = findProfileByUsbIds(0x0483, 0x5743);
    expect(profile?.id).toBe('xprinter-58-series');
  });

  it('falls back to Xprinter catch-all for same vendor unknown PID', () => {
    const profile = findProfileByUsbIds(0x0483, 0x9999);
    expect(profile?.id).toBe('xprinter-usb');
  });
});

describe('recommendPrinterSetup', () => {
  it('recommends browser when WebUSB unsupported', () => {
    const rec = recommendPrinterSetup([], { webUsbSupported: false });
    expect(rec?.printer.type).toBe('browser');
    expect(rec?.confidence).toBe('high');
  });

  it('recommends USB when a ready device is detected', () => {
    const detected: DetectedPrinter[] = [
      {
        id: 'usb:1208:514',
        label: 'Epson TM-T88',
        connection: 'usb',
        vendorId: 0x04b8,
        productId: 0x0202,
        matchedProfileId: 'epson-tm-t88',
        matchedProfileName: 'Epson TM-T88 Series',
        probeStatus: 'ready',
      },
    ];
    const rec = recommendPrinterSetup(detected);
    expect(rec?.printer.type).toBe('usb');
    expect(rec?.printer.profile).toBe('epson-tm-t88');
    expect(rec?.confidence).toBe('high');
  });

  it('recommends browser when OS driver claims the device', () => {
    const detected: DetectedPrinter[] = [
      {
        id: 'usb:1208:514',
        label: 'Receipt Printer',
        connection: 'usb',
        vendorId: 0x04b8,
        productId: 0x0202,
        probeStatus: 'os_driver_claimed',
      },
    ];
    const rec = recommendPrinterSetup(detected);
    expect(rec?.printer.type).toBe('browser');
    expect(rec?.summary).toContain('Windows');
  });

  it('recommends browser when no devices found', () => {
    const rec = recommendPrinterSetup([]);
    expect(rec?.printer.type).toBe('browser');
    expect(rec?.confidence).toBe('medium');
  });
});

describe('printerConfigFromDetected', () => {
  it('builds USB config for ready device', () => {
    const rec = printerConfigFromDetected({
      id: 'usb:1',
      label: 'Star TSP100',
      connection: 'usb',
      vendorId: 0x0519,
      productId: 0x0003,
      matchedProfileId: 'star-tsp100',
      matchedProfileName: 'Star TSP100 Series',
      probeStatus: 'ready',
    });
    expect(rec?.printer.type).toBe('usb');
    expect(rec?.printer.profile).toBe('star-tsp100');
  });

  it('suggests browser for OS-blocked USB', () => {
    const rec = printerConfigFromDetected({
      id: 'usb:2',
      label: 'Blocked Printer',
      connection: 'usb',
      probeStatus: 'os_driver_claimed',
    });
    expect(rec?.printer.type).toBe('browser');
  });
});
