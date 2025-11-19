/**
 * Hardware Compatibility Service
 * Main interface for all hardware devices
 */

import { receiptPrinterService, PrinterConfig, ReceiptData } from './receipt-printer';
import { barcodeScannerService, BarcodeScannerConfig } from './barcode-scanner';
import { qrReaderService, QRReaderConfig } from './qr-reader';

export interface HardwareConfig {
  printer?: PrinterConfig;
  barcodeScanner?: BarcodeScannerConfig;
  qrReader?: QRReaderConfig;
  cashDrawer?: {
    enabled: boolean;
    connectedToPrinter: boolean;
  };
  touchscreen?: {
    enabled: boolean;
  };
}

class HardwareService {
  private config: HardwareConfig = {};

  async setConfig(config: HardwareConfig): Promise<void> {
    this.config = config;

    if (config.printer) {
      await receiptPrinterService.setConfig(config.printer);
    }

    if (config.barcodeScanner) {
      barcodeScannerService.setConfig(config.barcodeScanner);
    }

    if (config.qrReader) {
      qrReaderService.setConfig(config.qrReader);
    }
  }

  getConfig(): HardwareConfig {
    return { ...this.config };
  }

  // Printer methods
  async printReceipt(data: ReceiptData): Promise<boolean> {
    return receiptPrinterService.printReceipt(data);
  }

  async openCashDrawer(): Promise<boolean> {
    if (this.config.cashDrawer?.enabled) {
      if (this.config.cashDrawer.connectedToPrinter) {
        return receiptPrinterService.openCashDrawer();
      }
      // Could add direct cash drawer control here
    }
    return false;
  }

  // Barcode scanner methods
  onBarcodeScan(callback: (barcode: string) => void): () => void {
    return barcodeScannerService.onScan(callback);
  }

  scanBarcode(barcode: string): void {
    barcodeScannerService.scan(barcode);
  }

  // QR reader methods
  async startQRScanning(
    videoElement: HTMLVideoElement,
    onScan: (data: string) => void
  ): Promise<boolean> {
    return qrReaderService.startScanning(videoElement, onScan);
  }

  async stopQRScanning(): Promise<void> {
    return qrReaderService.stopScanning();
  }

  // Touchscreen support (mostly handled by CSS, but can add touch-specific features)
  isTouchscreen(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  // Device detection
  async detectDevices(): Promise<{
    printers: Array<{ name: string; type: string }>;
    cameras: Array<{ deviceId: string; label: string }>;
  }> {
    const devices = {
      printers: [] as Array<{ name: string; type: string }>,
      cameras: [] as Array<{ deviceId: string; label: string }>,
    };

    // Detect cameras
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      const mediaDevices = await navigator.mediaDevices.enumerateDevices();
      devices.cameras = mediaDevices
        .filter(device => device.kind === 'videoinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${device.deviceId.substring(0, 8)}`,
        }));
    }

    // USB printers (would need user permission)
    if ('usb' in navigator) {
      // Note: This requires user interaction to request device access
      devices.printers.push({ name: 'USB Printer (requires permission)', type: 'usb' });
    }

    // Serial printers
    if ('serial' in navigator) {
      devices.printers.push({ name: 'Serial Printer (requires permission)', type: 'serial' });
    }

    // Browser print (always available)
    devices.printers.push({ name: 'Browser Print', type: 'browser' });

    return devices;
  }
}

export const hardwareService = new HardwareService();
export type { PrinterConfig, ReceiptData, BarcodeScannerConfig, QRReaderConfig };

