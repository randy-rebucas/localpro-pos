/**
 * Hardware Status Checker
 * Checks the status and availability of all hardware devices in this browser.
 */

import { hardwareService } from './index';
import { getLastDetectionResults } from './device-detector';
import { cashDrawerService } from './cash-drawer';

/**
 * Why a device has its status, as a stable code the UI can translate.
 * `message` stays as the English wording for logs and untranslated callers.
 */
export type DeviceStatusCode =
  | 'printerNotConfigured'
  | 'webUsbUnsupported'
  | 'usbReady'
  | 'usbReadyProfile'
  | 'usbOsDriver'
  | 'usbDetected'
  | 'usbConfigured'
  | 'serialUnsupported'
  | 'serialConfigured'
  | 'networkNoIp'
  | 'networkReachable'
  | 'networkTimeout'
  | 'networkUnreachable'
  | 'browserPrint'
  | 'printerError'
  | 'scannerOff'
  | 'scannerOn'
  | 'qrOff'
  | 'cameraApiMissing'
  | 'qrOn'
  | 'drawerOff'
  | 'drawerNeedsPrinter'
  | 'drawerViaPrinter'
  | 'drawerDirectMissing'
  | 'webSerialUnsupported'
  | 'drawerDirectActive'
  | 'drawerDirectPending'
  | 'touchDetected'
  | 'touchNotDetected';

export interface DeviceStatus {
  name: string;
  type: 'printer' | 'barcode-scanner' | 'qr-reader' | 'cash-drawer' | 'touchscreen';
  status: 'connected' | 'disconnected' | 'error' | 'not-configured' | 'available';
  code: DeviceStatusCode;
  message?: string;
  /** Extra detail to show as-is, such as a detected printer's label or profile, or an IP address. */
  detail?: string;
  lastChecked?: Date;
}

export interface HardwareStatus {
  devices: DeviceStatus[];
  overallStatus: 'all-connected' | 'partial' | 'none';
  lastCheck: Date;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

class HardwareStatusChecker {
  private statusCache: HardwareStatus | null = null;
  private cacheTimeout = 5000; // Cache for 5 seconds
  private lastCheckTime = 0;

  async checkAllDevices(): Promise<HardwareStatus> {
    const now = Date.now();

    // Return cached status if still valid
    if (this.statusCache && (now - this.lastCheckTime) < this.cacheTimeout) {
      return this.statusCache;
    }

    const config = hardwareService.getConfig();
    const devices: DeviceStatus[] = [
      await this.checkPrinter(config.printer),
      this.checkBarcodeScanner(config.barcodeScanner),
      this.checkQRReader(config.qrReader),
      this.checkCashDrawer(config.cashDrawer, config.printer),
      this.checkTouchscreen(),
    ];

    // The touchscreen is detection only, so a desktop without one does not count against the setup.
    const counted = devices.filter((d) => d.type !== 'touchscreen');
    const connectedCount = counted.filter(d => d.status === 'connected' || d.status === 'available').length;
    const overallStatus = connectedCount === counted.length
      ? 'all-connected'
      : connectedCount > 0
        ? 'partial'
        : 'none';

    this.statusCache = {
      devices,
      overallStatus,
      lastCheck: new Date(),
    };
    this.lastCheckTime = now;

    return this.statusCache;
  }

  private async checkPrinter(printerConfig: any): Promise<DeviceStatus> {
    const base = { name: 'Receipt Printer', type: 'printer' as const };
    if (!printerConfig) {
      return { ...base, status: 'not-configured', code: 'printerNotConfigured', message: 'No printer configured' };
    }

    try {
      switch (printerConfig.type) {
        case 'usb': {
          if (!('usb' in navigator)) {
            return { ...base, name: 'USB Printer', status: 'error', code: 'webUsbUnsupported', message: 'WebUSB not supported in this browser' };
          }

          const detection = getLastDetectionResults() ?? hardwareService.getLastPrinterDetection();
          const usbDetected = detection?.filter((d) => d.connection === 'usb') ?? [];
          const readyUsb = usbDetected.find((d) => d.probeStatus === 'ready');
          if (readyUsb) {
            return {
              ...base,
              name: readyUsb.label || 'USB Printer',
              status: 'connected',
              code: readyUsb.matchedProfileName ? 'usbReadyProfile' : 'usbReady',
              message: readyUsb.matchedProfileName
                ? `Ready — ${readyUsb.matchedProfileName}`
                : 'Ready for direct USB printing',
              detail: readyUsb.matchedProfileName || readyUsb.label,
            };
          }
          const blockedUsb = usbDetected.find((d) => d.probeStatus === 'os_driver_claimed');
          if (blockedUsb) {
            return {
              ...base,
              name: blockedUsb.label || 'USB Printer',
              status: 'error',
              code: 'usbOsDriver',
              message: 'Use Browser Print — OS driver is using this printer',
              detail: blockedUsb.label,
            };
          }
          if (usbDetected.length > 0) {
            const first = usbDetected[0];
            return {
              ...base,
              name: first.label || 'USB Printer',
              status: first.probeStatus === 'error' ? 'error' : 'available',
              code: 'usbDetected',
              message: first.probeMessage || 'USB printer detected — run Scan on Hardware Settings',
              detail: first.label,
            };
          }

          return {
            ...base,
            name: 'USB Printer',
            status: 'available',
            code: 'usbConfigured',
            message: 'USB printer configured — use Detect Devices to verify connection',
          };
        }

        case 'serial':
          if (!('serial' in navigator)) {
            return { ...base, name: 'Serial Printer', status: 'error', code: 'serialUnsupported', message: 'Serial API not supported in this browser' };
          }
          return { ...base, name: 'Serial Printer', status: 'available', code: 'serialConfigured', message: 'Serial printer configured (requires connection test)' };

        case 'network': {
          if (!printerConfig.ipAddress) {
            return { ...base, name: 'Network Printer', status: 'not-configured', code: 'networkNoIp', message: 'IP address not configured' };
          }
          const port = printerConfig.portNumber || 9100;
          const networkStatus = await this.checkNetworkPrinter(printerConfig.ipAddress, port);
          return {
            ...base,
            name: `Network Printer (${printerConfig.ipAddress})`,
            status: networkStatus.connected ? 'connected' : 'disconnected',
            code: networkStatus.code,
            message: networkStatus.message,
            detail: `${printerConfig.ipAddress}:${port}`,
          };
        }

        case 'browser':
        default:
          return { ...base, name: 'Browser Print', status: 'available', code: 'browserPrint', message: 'Browser print dialog available' };
      }
    } catch (error: any) {
      return { ...base, status: 'error', code: 'printerError', message: error.message || 'Unknown error' };
    }
  }

  private async checkNetworkPrinter(
    ip: string,
    port: number
  ): Promise<{ connected: boolean; code: DeviceStatusCode; message: string }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    try {
      // In `no-cors` mode, fetch resolves (with an opaque response) as long as the host
      // accepted the connection, so a resolved promise means the host is reachable and a
      // rejected one means it is not (refused, unreachable or timed out).
      await fetch(`http://${ip}:${port}`, { method: 'GET', signal: controller.signal, mode: 'no-cors' });
      return { connected: true, code: 'networkReachable', message: 'Printer reachable' };
    } catch {
      if (controller.signal.aborted) {
        return { connected: false, code: 'networkTimeout', message: 'Printer connection timed out' };
      }
      return { connected: false, code: 'networkUnreachable', message: 'Printer unreachable — check IP/port and that it\'s powered on' };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private checkBarcodeScanner(scannerConfig: any): DeviceStatus {
    const base = { name: 'Barcode Scanner', type: 'barcode-scanner' as const };
    if (!scannerConfig || !scannerConfig.enabled) {
      return { ...base, status: 'not-configured', code: 'scannerOff', message: 'Barcode scanner not enabled' };
    }
    // Scanners work as keyboard input, so this only confirms the setting is on; a
    // keyboard-emulating scanner is invisible to the browser.
    return { ...base, status: 'available', code: 'scannerOn', message: 'Configured (keyboard input mode — scan a barcode to verify)' };
  }

  private checkQRReader(qrConfig: any): DeviceStatus {
    const base = { name: 'QR Code Reader', type: 'qr-reader' as const };
    if (!qrConfig || !qrConfig.enabled) {
      return { ...base, status: 'not-configured', code: 'qrOff', message: 'QR code reader not enabled' };
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { ...base, status: 'error', code: 'cameraApiMissing', message: 'Camera API not available' };
    }
    // Only confirms the browser exposes a camera API, not that a camera exists or is permitted.
    return { ...base, status: 'available', code: 'qrOn', message: 'Configured (camera not verified until scanning starts)' };
  }

  private checkCashDrawer(drawerConfig: any, printerConfig: any): DeviceStatus {
    const base = { name: 'Cash Drawer', type: 'cash-drawer' as const };
    if (!drawerConfig || !drawerConfig.enabled) {
      return { ...base, status: 'not-configured', code: 'drawerOff', message: 'Cash drawer not enabled' };
    }

    if (drawerConfig.connectedToPrinter) {
      if (!printerConfig) {
        return { ...base, status: 'error', code: 'drawerNeedsPrinter', message: 'Cash drawer requires printer configuration' };
      }
      // The drawer only opens through the printer's pulse command, so "available" means
      // "will attempt via the printer", not an independent check.
      return { ...base, status: 'available', code: 'drawerViaPrinter', message: 'Configured (opens via printer — not independently verified)' };
    }

    if (!drawerConfig.direct) {
      return { ...base, status: 'not-configured', code: 'drawerDirectMissing', message: 'Direct cash drawer connection not configured' };
    }
    if (drawerConfig.direct.type === 'usb' && !('usb' in navigator)) {
      return { ...base, status: 'error', code: 'webUsbUnsupported', message: 'WebUSB not supported in this browser' };
    }
    if (drawerConfig.direct.type === 'serial' && !('serial' in navigator)) {
      return { ...base, status: 'error', code: 'webSerialUnsupported', message: 'Web Serial not supported in this browser' };
    }

    const connected = cashDrawerService.isConnected();
    return {
      ...base,
      status: connected ? 'connected' : 'available',
      code: connected ? 'drawerDirectActive' : 'drawerDirectPending',
      message: connected ? 'Direct connection active' : 'Direct connection configured — will pair on next use',
    };
  }

  private checkTouchscreen(): DeviceStatus {
    // Detection only: no register feature reads a touchscreen setting.
    const base = { name: 'Touchscreen Display', type: 'touchscreen' as const };
    return hardwareService.isTouchscreen()
      ? { ...base, status: 'available', code: 'touchDetected', message: 'Touch input detected' }
      : { ...base, status: 'not-configured', code: 'touchNotDetected', message: 'No touch input detected' };
  }

  clearCache(): void {
    this.statusCache = null;
    this.lastCheckTime = 0;
  }
}

export const hardwareStatusChecker = new HardwareStatusChecker();
