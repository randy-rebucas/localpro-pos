/**
 * Direct (non-printer) cash drawer service.
 * Standalone USB/serial cash drawers (APG, MMF, etc.) accept the same ESC/POS
 * pulse command as printer-attached drawers — this mirrors the connect/send
 * pattern in receipt-printer.ts but pairs its own device instead of a printer.
 */
import { logger } from '@/lib/logger';
import { isDevicePickerCancelled, isUsbAccessDeniedError } from './usb-probe';

export interface CashDrawerConfig {
  type: 'usb' | 'serial';
  vendorId?: number;
  productId?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type USBDevice = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SerialPort = any;

class CashDrawerService {
  private config: CashDrawerConfig | null = null;
  private device: USBDevice | SerialPort | null = null;

  setConfig(config: CashDrawerConfig): void {
    this.config = config;
  }

  isConnected(): boolean {
    return this.device !== null;
  }

  async connect(options: { allowDevicePicker?: boolean } = {}): Promise<boolean> {
    const { allowDevicePicker = false } = options;
    if (!this.config) return false;

    try {
      if (this.config.type === 'usb' && 'usb' in navigator) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const usb = (navigator as any).usb;
        const pairedDevices: USBDevice[] = await usb.getDevices();
        let device: USBDevice | null = null;

        if (pairedDevices.length > 0) {
          device = this.config.vendorId && this.config.productId
            ? pairedDevices.find(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (d: any) => d.vendorId === this.config!.vendorId && d.productId === this.config!.productId
              ) ?? pairedDevices[0]
            : pairedDevices[0];
        }

        if (!device) {
          if (!allowDevicePicker) {
            logger.info('No paired USB cash drawer — pair via Admin → Hardware first.');
            return false;
          }
          device = await usb.requestDevice({
            filters: this.config.vendorId
              ? [{ vendorId: this.config.vendorId, ...(this.config.productId ? { productId: this.config.productId } : {}) }]
              : [],
          });
        }

        try {
          await device.open();
          if (device.configuration === null) {
            await device.selectConfiguration(1);
          }
          await device.claimInterface(0);
          this.device = device;
          return true;
        } catch (usbError) {
          if (isUsbAccessDeniedError(usbError)) {
            logger.info('USB cash drawer access denied (likely claimed by OS driver).');
          } else {
            logger.warn('USB cash drawer connect failed:', {
              error: usbError instanceof Error ? usbError.message : String(usbError),
            });
          }
          return false;
        }
      } else if (this.config.type === 'serial' && 'serial' in navigator) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const serial = (navigator as any).serial;
        const pairedPorts: SerialPort[] = await serial.getPorts();
        let port: SerialPort | null = pairedPorts[0] ?? null;

        if (!port) {
          if (!allowDevicePicker) {
            logger.info('No paired serial cash drawer — pair via Admin → Hardware first.');
            return false;
          }
          port = await serial.requestPort();
        }

        try {
          await port.open({ baudRate: 9600 });
          this.device = port;
          return true;
        } catch {
          logger.info('Serial cash drawer port access denied (likely in use).');
          return false;
        }
      }
      return false;
    } catch (error) {
      if (isDevicePickerCancelled(error)) {
        logger.info('Cash drawer device picker closed without selecting a device.');
        return false;
      }
      logger.error('Failed to connect to cash drawer:', error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.device) {
      try {
        await this.device.close();
      } catch {
        // ignore
      }
      this.device = null;
    }
  }

  private getBulkOutEndpoint(): number {
    try {
      const iface = (this.device as USBDevice)?.configuration?.interfaces?.[0];
      const alternate = iface?.alternates?.[0];
      const ep = alternate?.endpoints?.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (e: any) => e.direction === 'out' && e.type === 'bulk'
      );
      return ep?.endpointNumber ?? 1;
    } catch {
      return 1;
    }
  }

  async open(): Promise<boolean> {
    try {
      if (!this.device) {
        const connected = await this.connect();
        if (!connected) {
          logger.info('Cash drawer: not connected. Use Hardware Settings to pair first.');
          return false;
        }
      }

      // ESC/POS command to pulse the drawer kick pin (ESC p m t1 t2)
      const command = new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFF]);

      if (this.config?.type === 'usb') {
        await (this.device as USBDevice).transferOut(this.getBulkOutEndpoint(), command);
      } else if (this.config?.type === 'serial') {
        const writer = (this.device as SerialPort).writable.getWriter();
        await writer.write(command);
        writer.releaseLock();
      }
      return true;
    } catch (error) {
      logger.error('Failed to open cash drawer (direct):', error);
      return false;
    }
  }
}

export const cashDrawerService = new CashDrawerService();
