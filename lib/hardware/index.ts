/**
 * Hardware Compatibility Service
 * Main interface for all hardware devices
 */

import { receiptPrinterService, PrinterConfig, ReceiptData } from './receipt-printer';
import { barcodeScannerService, BarcodeScannerConfig } from './barcode-scanner';
import { qrReaderService, QRReaderConfig } from './qr-reader';
import { cashDrawerService, CashDrawerConfig } from './cash-drawer';
import {
  detectPrinters,
  recommendPrinterSetup,
  getLastDetectionResults,
  type DetectedPrinter,
  type PrinterSetupRecommendation,
  type DetectPrintersOptions,
} from './device-detector';

export interface HardwareConfig {
  printer?: PrinterConfig;
  barcodeScanner?: BarcodeScannerConfig;
  qrReader?: QRReaderConfig;
  cashDrawer?: {
    enabled: boolean;
    connectedToPrinter: boolean;
    /** Device config when connectedToPrinter is false (standalone USB/serial drawer). */
    direct?: CashDrawerConfig;
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

    if (config.cashDrawer?.enabled && !config.cashDrawer.connectedToPrinter && config.cashDrawer.direct) {
      cashDrawerService.setConfig(config.cashDrawer.direct);
    }
  }

  getConfig(): HardwareConfig {
    return { ...this.config };
  }

  // Printer methods
  async printReceipt(
    data: ReceiptData,
    options?: { allowDevicePicker?: boolean }
  ): Promise<boolean> {
    return receiptPrinterService.printReceipt(data, options);
  }

  async openCashDrawer(): Promise<boolean> {
    if (this.config.cashDrawer?.enabled) {
      if (this.config.cashDrawer.connectedToPrinter) {
        return receiptPrinterService.openCashDrawer();
      }
      if (this.config.cashDrawer.direct) {
        return cashDrawerService.open();
      }
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

  /** Enumerate QR cameras only (printers use detectPrinters on user action). */
  async detectCameras(): Promise<Array<{ deviceId: string; label: string }>> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return [];
    }
    const mediaDevices = await navigator.mediaDevices.enumerateDevices();
    return mediaDevices
      .filter((device) => device.kind === 'videoinput')
      .map((device) => ({
        deviceId: device.deviceId,
        label: device.label || `Camera ${device.deviceId.substring(0, 8)}`,
      }));
  }

  async detectDevices(): Promise<{
    printers: Array<{ name: string; type: string }>;
    cameras: Array<{ deviceId: string; label: string }>;
  }> {
    const cameras = await this.detectCameras();
    return {
      printers: [],
      cameras,
    };
  }

  async detectPrinters(options?: DetectPrintersOptions): Promise<DetectedPrinter[]> {
    return detectPrinters(options);
  }

  recommendPrinterSetup(detected: DetectedPrinter[]): PrinterSetupRecommendation | null {
    const webUsbSupported = typeof navigator !== 'undefined' && 'usb' in navigator;
    return recommendPrinterSetup(detected, { webUsbSupported });
  }

  getLastPrinterDetection(): DetectedPrinter[] | null {
    return getLastDetectionResults();
  }
}

export const hardwareService = new HardwareService();
export type { PrinterConfig, ReceiptData, BarcodeScannerConfig, QRReaderConfig, CashDrawerConfig };
export { PRINTER_PROFILES, findProfile, findProfileByUsbIds } from './printer-profiles';
export type { PrinterProfile } from './printer-profiles';
export {
  detectPrinters,
  recommendPrinterSetup,
  printerConfigFromDetected,
  getLastDetectionResults,
} from './device-detector';
export type {
  DetectedPrinter,
  PrinterSetupRecommendation,
  DetectPrintersOptions,
  PrinterProbeStatus,
} from './device-detector';

