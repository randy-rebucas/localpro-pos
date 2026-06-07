/**
 * Printer device detection and setup recommendations (WebUSB / Serial API).
 */

import type { PrinterConfig } from './receipt-printer';
import {
  PRINTER_PROFILES,
  findProfileByUsbIds,
} from './printer-profiles';
import { probeUsbDevice } from './usb-probe';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type USBDeviceLike = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SerialPortLike = any;

export type PrinterProbeStatus = 'ready' | 'os_driver_claimed' | 'unsupported' | 'error';

export interface DetectedPrinter {
  id: string;
  label: string;
  connection: 'usb' | 'serial';
  vendorId?: number;
  productId?: number;
  matchedProfileId?: string;
  matchedProfileName?: string;
  probeStatus: PrinterProbeStatus;
  probeMessage?: string;
}

export interface PrinterSetupRecommendation {
  printer: PrinterConfig;
  summary: string;
  confidence: 'high' | 'medium';
}

export interface DetectPrintersOptions {
  /** When true, opens the browser USB picker (requires user gesture). */
  requestNewUsb?: boolean;
}

const DETECTION_CACHE_TTL_MS = 5 * 60 * 1000;
let lastDetectionCache: { devices: DetectedPrinter[]; at: number } | null = null;

export function getLastDetectionResults(): DetectedPrinter[] | null {
  if (!lastDetectionCache) return null;
  if (Date.now() - lastDetectionCache.at > DETECTION_CACHE_TTL_MS) {
    lastDetectionCache = null;
    return null;
  }
  return lastDetectionCache.devices;
}

export function setLastDetectionResults(devices: DetectedPrinter[]): void {
  lastDetectionCache = { devices, at: Date.now() };
}

function formatUsbId(id: number): string {
  return `0x${id.toString(16).padStart(4, '0')}`;
}

function usbDeviceLabel(device: USBDeviceLike): string {
  const product = device.productName?.trim();
  const manufacturer = device.manufacturerName?.trim();
  if (product && manufacturer) return `${manufacturer} ${product}`;
  if (product) return product;
  if (manufacturer) return manufacturer;
  return `USB ${formatUsbId(device.vendorId)}:${formatUsbId(device.productId)}`;
}

function buildUsbFilters(): Array<{ vendorId: number; productId?: number }> {
  const seen = new Set<string>();
  const filters: Array<{ vendorId: number; productId?: number }> = [];
  for (const profile of PRINTER_PROFILES) {
    if (profile.type !== 'usb' || profile.vendorId === undefined) continue;
    const key = `${profile.vendorId}:${profile.productId ?? '*'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    filters.push({
      vendorId: profile.vendorId,
      ...(profile.productId !== undefined ? { productId: profile.productId } : {}),
    });
  }
  return filters;
}

async function detectUsbPrinters(requestNewUsb: boolean): Promise<DetectedPrinter[]> {
  if (typeof navigator === 'undefined' || !('usb' in navigator)) {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usb = (navigator as any).usb;
  const paired: USBDeviceLike[] = await usb.getDevices();
  const byKey = new Map<string, USBDeviceLike>();

  for (const device of paired) {
    const key = `usb:${device.vendorId}:${device.productId}`;
    byKey.set(key, device);
  }

  if (requestNewUsb) {
    try {
      const filters = buildUsbFilters();
      const picked: USBDeviceLike = await usb.requestDevice({
        filters: filters.length > 0 ? filters : [],
      });
      const key = `usb:${picked.vendorId}:${picked.productId}`;
      byKey.set(key, picked);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        // User cancelled picker — not an error
      } else {
        throw error;
      }
    }
  }

  const results: DetectedPrinter[] = [];
  for (const device of byKey.values()) {
    const profile = findProfileByUsbIds(device.vendorId, device.productId);
    const probe = await probeUsbDevice(device);
    const probeStatus: PrinterProbeStatus =
      probe.status === 'ready'
        ? 'ready'
        : probe.status === 'os_driver_claimed'
          ? 'os_driver_claimed'
          : 'error';

    results.push({
      id: `usb:${device.vendorId}:${device.productId}`,
      label: usbDeviceLabel(device),
      connection: 'usb',
      vendorId: device.vendorId,
      productId: device.productId,
      matchedProfileId: profile?.id,
      matchedProfileName: profile?.name,
      probeStatus,
      probeMessage: probe.message,
    });
  }

  return results;
}

async function probeSerialPort(port: SerialPortLike): Promise<PrinterProbeStatus> {
  try {
    await port.open({ baudRate: 9600 });
    await port.close();
    return 'ready';
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('access') || message.includes('in use') || message.includes('denied')) {
      return 'os_driver_claimed';
    }
    return 'error';
  }
}

async function detectSerialPrinters(): Promise<DetectedPrinter[]> {
  if (typeof navigator === 'undefined' || !('serial' in navigator)) {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serial = (navigator as any).serial;
  const ports: SerialPortLike[] = await serial.getPorts();
  const results: DetectedPrinter[] = [];

  for (let i = 0; i < ports.length; i++) {
    const port = ports[i];
    const probeStatus = await probeSerialPort(port);
    results.push({
      id: `serial:${i}`,
      label: `Serial port ${i + 1}`,
      connection: 'serial',
      probeStatus,
      probeMessage:
        probeStatus === 'os_driver_claimed'
          ? 'Serial port is in use by another application'
          : probeStatus === 'error'
            ? 'Could not open serial port'
            : undefined,
    });
  }

  return results;
}

export async function detectPrinters(
  options: DetectPrintersOptions = {}
): Promise<DetectedPrinter[]> {
  const { requestNewUsb = false } = options;
  const webUsbSupported = typeof navigator !== 'undefined' && 'usb' in navigator;
  const serialSupported = typeof navigator !== 'undefined' && 'serial' in navigator;

  if (!webUsbSupported && !serialSupported) {
    const unsupported: DetectedPrinter[] = [
      {
        id: 'unsupported:webusb',
        label: 'WebUSB / Serial not available',
        connection: 'usb',
        probeStatus: 'unsupported',
        probeMessage: 'Use Chrome or Edge over HTTPS, or choose Browser Print',
      },
    ];
    setLastDetectionResults(unsupported);
    return unsupported;
  }

  const [usbDevices, serialDevices] = await Promise.all([
    detectUsbPrinters(requestNewUsb),
    detectSerialPrinters(),
  ]);

  const devices = [...usbDevices, ...serialDevices];
  setLastDetectionResults(devices);
  return devices;
}

/**
 * Pure recommendation logic (testable without browser APIs).
 */
export function recommendPrinterSetup(
  detected: DetectedPrinter[],
  options?: { webUsbSupported?: boolean }
): PrinterSetupRecommendation | null {
  const webUsbSupported = options?.webUsbSupported ?? true;

  if (!webUsbSupported) {
    return {
      printer: { type: 'browser' },
      summary:
        'WebUSB is not supported in this browser. Use Browser Print to print via the system dialog.',
      confidence: 'high',
    };
  }

  const realDevices = detected.filter((d) => d.probeStatus !== 'unsupported');
  if (realDevices.length === 0) {
    return {
      printer: { type: 'browser' },
      summary:
        'No USB or serial printers detected. Use Browser Print, or connect a printer and scan again.',
      confidence: 'medium',
    };
  }

  const readyUsb = realDevices.find((d) => d.connection === 'usb' && d.probeStatus === 'ready');
  if (readyUsb) {
    const profileId = readyUsb.matchedProfileId ?? 'generic-usb';
    return {
      printer: {
        type: 'usb',
        profile: profileId,
        vendorId: readyUsb.vendorId,
        productId: readyUsb.productId,
        name: readyUsb.label,
      },
      summary: readyUsb.matchedProfileName
        ? `Direct USB access works. Use ${readyUsb.matchedProfileName} profile.`
        : 'Direct USB access works. Use Generic ESC/POS (USB) profile.',
      confidence: 'high',
    };
  }

  const readySerial = realDevices.find((d) => d.connection === 'serial' && d.probeStatus === 'ready');
  if (readySerial) {
    return {
      printer: { type: 'serial', name: readySerial.label },
      summary: 'Serial printer is available for direct ESC/POS printing.',
      confidence: 'high',
    };
  }

  const osBlocked = realDevices.some((d) => d.probeStatus === 'os_driver_claimed');
  if (osBlocked) {
    const blocked = realDevices.find((d) => d.probeStatus === 'os_driver_claimed');
    return {
      printer: { type: 'browser' },
      summary: blocked
        ? `${blocked.label} is managed by Windows — use Browser Print (prints via the system dialog).`
        : 'Printer is managed by Windows — use Browser Print (prints via the system dialog).',
      confidence: 'high',
    };
  }

  return {
    printer: { type: 'browser' },
    summary: 'Could not access the printer directly. Browser Print is the most reliable option.',
    confidence: 'medium',
  };
}

/** Build a PrinterConfig for a specific detected device. */
export function printerConfigFromDetected(device: DetectedPrinter): PrinterSetupRecommendation | null {
  if (device.probeStatus === 'unsupported') {
    return recommendPrinterSetup([device]);
  }

  if (device.connection === 'usb') {
    if (device.probeStatus === 'ready') {
      const profileId = device.matchedProfileId ?? 'generic-usb';
      return {
        printer: {
          type: 'usb',
          profile: profileId,
          vendorId: device.vendorId,
          productId: device.productId,
          name: device.label,
        },
        summary: device.matchedProfileName
          ? `Use ${device.matchedProfileName} (${device.label})`
          : `Use Generic ESC/POS USB (${device.label})`,
        confidence: 'high',
      };
    }
    if (device.probeStatus === 'os_driver_claimed') {
      return {
        printer: { type: 'browser' },
        summary: `${device.label} — use Browser Print (OS driver is using this printer).`,
        confidence: 'high',
      };
    }
    return null;
  }

  if (device.connection === 'serial' && device.probeStatus === 'ready') {
    return {
      printer: { type: 'serial', name: device.label },
      summary: `Use serial printer: ${device.label}`,
      confidence: 'high',
    };
  }

  return null;
}
