import { describe, it, expect, beforeEach } from 'vitest';
import { hardwareService } from '@/lib/hardware';
import { hardwareStatusChecker } from '@/lib/hardware/status-checker';

const byType = async () => {
  hardwareStatusChecker.clearCache();
  const status = await hardwareStatusChecker.checkAllDevices();
  return { status, d: Object.fromEntries(status.devices.map((x) => [x.type, x])) };
};

describe('hardwareStatusChecker', () => {
  beforeEach(async () => {
    await hardwareService.setConfig({});
  });

  it('gives every device a translatable code', async () => {
    const { d } = await byType();
    expect(d.printer.code).toBe('printerNotConfigured');
    expect(d['barcode-scanner'].code).toBe('scannerOff');
    expect(d['qr-reader'].code).toBe('qrOff');
    expect(d['cash-drawer'].code).toBe('drawerOff');
    expect(['touchDetected', 'touchNotDetected']).toContain(d.touchscreen.code);
  });

  it('reports a network printer without an IP as not configured', async () => {
    await hardwareService.setConfig({ printer: { type: 'network' } });
    const { d } = await byType();
    expect(d.printer).toMatchObject({ status: 'not-configured', code: 'networkNoIp' });
  });

  it('flags a printer-driven drawer with no printer', async () => {
    await hardwareService.setConfig({ cashDrawer: { enabled: true, connectedToPrinter: true } });
    const { d } = await byType();
    expect(d['cash-drawer']).toMatchObject({ status: 'error', code: 'drawerNeedsPrinter' });
  });

  it('leaves the touchscreen out of the overall status', async () => {
    await hardwareService.setConfig({
      printer: { type: 'browser' },
      barcodeScanner: { type: 'keyboard', enabled: true },
      qrReader: { enabled: true },
      cashDrawer: { enabled: true, connectedToPrinter: true },
    });
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: () => undefined }, configurable: true });
    const { status, d } = await byType();
    expect(d.touchscreen).toBeDefined();
    expect(status.overallStatus).toBe('all-connected');
  });
});
