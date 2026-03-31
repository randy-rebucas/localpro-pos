/**
 * Receipt Printer Service
 * Supports ESC/POS printers via WebUSB, Serial API, or network printing
 */
import { logger } from '@/lib/logger';
import { findProfile } from './printer-profiles';

// Web API types (available in browsers that support these APIs)
// Using any for browser APIs that may not have complete type definitions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type USBDevice = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SerialPort = any;

export interface PrinterConfig {
  type: 'usb' | 'serial' | 'network' | 'browser';
  /** Profile id from PRINTER_PROFILES (e.g. 'custom-psd200i'). When set,
   *  vendorId/productId are sourced from the profile unless overridden. */
  profile?: string;
  name?: string;
  vendorId?: number;
  productId?: number;
  port?: string;
  ipAddress?: string;
  portNumber?: number;
}

export interface ReceiptData {
  storeName?: string;
  logo?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  receiptNumber: string;
  date: string;
  time?: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    subtotal: number;
    sku?: string;
  }>;
  subtotal: number;
  discount?: number;
  tax?: number;
  taxLabel?: string;
  total: number;
  paymentMethod: string;
  cashReceived?: number;
  change?: number;
  footer?: string;
  header?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  template?: string; // Template HTML to use
  // BIR compliance fields
  tin?: string;            // BIR Tax Identification Number
  businessStyle?: string;  // Trade name / style of business
  ptuNumber?: string;      // Permit to Use number
  ptuDate?: string;        // PTU date issued (formatted string)
  minNumber?: string;      // Machine Identification Number
  systemProvider?: string; // Accredited system provider name
  isVAT?: boolean;         // true = VAT-registered, false = NON-VAT
  taxRate?: number;        // Tax rate from tenant settings (e.g. 12 for 12%)
  customerTIN?: string;    // Customer TIN (optional)
  openDrawerOnPrint?: boolean; // Kick cash drawer after printing (for cash payments)
}

class ReceiptPrinterService {
  private config: PrinterConfig | null = null;
  private device: USBDevice | SerialPort | null = null;

  async setConfig(config: PrinterConfig): Promise<void> {
    this.config = config;
  }

  async connect(): Promise<boolean> {
    if (!this.config) {
      throw new Error('Printer configuration not set');
    }

    try {
      if (this.config.type === 'usb' && 'usb' in navigator) {
        // Resolve vendorId / productId: explicit config values take priority,
        // then fall back to the selected printer profile.
        const profile = this.config.profile ? findProfile(this.config.profile) : undefined;
        const vendorId = this.config.vendorId ?? profile?.vendorId;
        const productId = this.config.productId ?? profile?.productId;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const usb = (navigator as any).usb;

        // Try previously-authorized devices first — works without a user gesture,
        // which is required when printing is triggered programmatically after checkout.
        const pairedDevices: USBDevice[] = await usb.getDevices();
        let device: USBDevice | null = null;

        if (pairedDevices.length > 0) {
          device = vendorId && productId
            ? pairedDevices.find(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (d: any) => d.vendorId === vendorId && d.productId === productId
              ) ?? pairedDevices[0]
            : pairedDevices[0];
        }

        if (!device) {
          // No paired device — fall back to the picker (requires a live user gesture,
          // so this path only works from the hardware settings test button).
          device = await usb.requestDevice({
            filters: vendorId ? [{ vendorId, ...(productId ? { productId } : {}) }] : [],
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
          // "Access denied" — device is claimed by OS print driver or another process.
          // This is normal when the printer is used via OS driver (browser print mode).
          logger.info('USB device access denied (likely claimed by OS driver). Use browser print mode instead.');
          return false;
        }
      } else if (this.config.type === 'serial' && 'serial' in navigator) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const serial = (navigator as any).serial;

        // Try previously-authorized ports first (no user gesture required).
        const pairedPorts: SerialPort[] = await serial.getPorts();
        let port: SerialPort | null = pairedPorts[0] ?? null;

        if (!port) {
          port = await serial.requestPort();
        }

        try {
          await port.open({ baudRate: 9600 });
          this.device = port;
          return true;
        } catch (serialError) {
          logger.info('Serial port access denied (likely in use). Use browser print mode instead.');
          return false;
        }
      }
      return false;
    } catch (error) {
      logger.error('Failed to connect to printer:', error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.device) {
      if ('close' in this.device) {
        await (this.device as SerialPort).close();
      } else if ('close' in this.device) {
        await (this.device as USBDevice).close();
      }
      this.device = null;
    }
  }

  /** Find the first bulk-OUT endpoint on the claimed interface. */
  private getBulkOutEndpoint(): number {
    try {
      const iface = (this.device as USBDevice)?.configuration?.interfaces?.[0];
      const alternate = iface?.alternates?.[0];
      const ep = alternate?.endpoints?.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (e: any) => e.direction === 'out' && e.type === 'bulk'
      );
      return ep?.endpointNumber ?? 1; // fall back to 1 (works on most ESC/POS printers)
    } catch {
      return 1;
    }
  }

  private async sendData(data: Uint8Array): Promise<void> {
    if (!this.device || !this.config) {
      // Throw error to be caught by printReceipt's try-catch for fallback
      throw new Error('Printer not connected');
    }

    try {
      if (this.config.type === 'usb') {
        await (this.device as USBDevice).transferOut(this.getBulkOutEndpoint(), data);
      } else if (this.config.type === 'serial') {
        const writer = (this.device as SerialPort).writable.getWriter();
        await writer.write(data);
        writer.releaseLock();
      }
    } catch (error) {
      console.warn('Failed to send data to printer:', error);
      // Re-throw to be caught by printReceipt's try-catch
      throw error;
    }
  }

  private encodeText(text: string): Uint8Array {
    return new TextEncoder().encode(text);
  }

  // ESC/POS Commands
  private ESC = 0x1B;
  private GS = 0x1D;
  private LF = 0x0A;

  private init(): Uint8Array {
    return new Uint8Array([this.ESC, 0x40]); // ESC @ - Initialize printer
  }

  private cut(): Uint8Array {
    return new Uint8Array([this.GS, 0x56, 0x00]); // GS V 0 - Full cut
  }

  private feed(lines: number = 3): Uint8Array {
    return new Uint8Array([this.ESC, 0x64, lines]); // ESC d n - Feed n lines
  }

  private setAlign(align: 'left' | 'center' | 'right'): Uint8Array {
    const alignCodes = { left: 0, center: 1, right: 2 };
    return new Uint8Array([this.ESC, 0x61, alignCodes[align]]);
  }

  private setFontSize(size: 'normal' | 'large'): Uint8Array {
    if (size === 'large') {
      return new Uint8Array([this.GS, 0x21, 0x11]); // Double width and height
    }
    return new Uint8Array([this.GS, 0x21, 0x00]); // Normal size
  }

  private setBold(enabled: boolean): Uint8Array {
    return new Uint8Array([this.ESC, 0x45, enabled ? 1 : 0]);
  }

  async printReceipt(data: ReceiptData): Promise<boolean> {
    try {
      if (this.config?.type === 'browser') {
        const printed = this.printViaBrowser(data);
        // After browser print, kick drawer via server API if requested
        if (printed && data.openDrawerOnPrint) {
          this.openDrawerViaPrintProxy().catch(() => {
            // Silent fail — drawer kick is best-effort in browser mode
          });
        }
        return printed;
      }

      if (!this.device && this.config && this.config.type !== 'network') {
        const connected = await this.connect();
        if (!connected) {
          console.warn('Could not connect to printer, falling back to browser print');
          return this.printViaBrowser(data);
        }
      }

      if (this.config?.type === 'network') {
        return this.printViaNetwork(data);
      }

      // Build ESC/POS commands
      const commands: Uint8Array[] = [];

      // Initialize
      commands.push(this.init());

      const fmt = (n: number) => n.toFixed(2);
      const isVAT = data.isVAT ?? ((data.taxLabel || '').toUpperCase().includes('VAT') && !!data.tax);
      const vatAmount = data.tax ?? 0;
      const discountedSubtotal = data.subtotal - (data.discount ?? 0);
      const vatableSales = isVAT && vatAmount > 0 ? discountedSubtotal - vatAmount : 0;
      const vatExemptSales = isVAT ? 0 : discountedSubtotal;
      const line = '--------------------------------\n';

      // Header (centered)
      commands.push(this.setAlign('center'));
      commands.push(this.setFontSize('large'));
      commands.push(this.setBold(true));
      if (data.storeName) commands.push(this.encodeText(data.storeName + '\n'));
      commands.push(this.setFontSize('normal'));
      commands.push(this.setBold(false));
      if (data.businessStyle) commands.push(this.encodeText(data.businessStyle + '\n'));
      if (data.address) commands.push(this.encodeText(data.address + '\n'));
      if (data.phone) commands.push(this.encodeText(data.phone + '\n'));
      if (data.tin) commands.push(this.encodeText(`TIN: ${data.tin}\n`));
      commands.push(this.encodeText((isVAT ? 'VAT' : 'NON-VAT') + ' Registered\n'));
      commands.push(this.encodeText('\n'));
      commands.push(this.setBold(true));
      commands.push(this.encodeText('OFFICIAL RECEIPT\n'));
      commands.push(this.setBold(false));
      commands.push(this.setAlign('left'));
      commands.push(this.encodeText(`Serial No: ${data.receiptNumber}\n`));
      commands.push(this.encodeText(`Date: ${data.date}${data.time ? ' ' + data.time : ''}\n`));
      if (data.customerName) {
        commands.push(this.encodeText(`Customer: ${data.customerName}\n`));
        if (data.customerTIN) commands.push(this.encodeText(`TIN: ${data.customerTIN}\n`));
      }
      commands.push(this.encodeText(line));

      // Items
      data.items.forEach((item) => {
        const name = item.name.substring(0, 20).padEnd(20);
        const qty = `x${item.quantity}`.padStart(4);
        commands.push(this.encodeText(`${name} ${qty}\n`));
        const atPrice = `  @ ${fmt(item.price)}`.padEnd(20);
        const subtotalStr = fmt(item.subtotal).padStart(12);
        commands.push(this.encodeText(`${atPrice}${subtotalStr}\n`));
      });

      commands.push(this.encodeText(line));

      // Totals
      commands.push(this.setAlign('right'));
      commands.push(this.encodeText(`Subtotal:         ${fmt(data.subtotal)}\n`));
      if (data.discount) commands.push(this.encodeText(`Discount:        -${fmt(data.discount)}\n`));
      if (isVAT) {
        commands.push(this.encodeText(`VATable Sales:    ${fmt(vatableSales)}\n`));
        commands.push(this.encodeText(`${data.taxLabel || 'VAT'}:             ${fmt(vatAmount)}\n`));
        commands.push(this.encodeText(`VAT-Exempt:       ${fmt(vatExemptSales)}\n`));
      } else {
        commands.push(this.encodeText(`VAT-Exempt Sales: ${fmt(vatExemptSales)}\n`));
      }
      commands.push(this.setBold(true));
      commands.push(this.encodeText(`TOTAL:            ${fmt(data.total)}\n`));
      commands.push(this.setBold(false));
      commands.push(this.encodeText(line));
      commands.push(this.setAlign('left'));
      commands.push(this.encodeText(`Payment: ${data.paymentMethod.toUpperCase()}\n`));
      if (data.cashReceived) commands.push(this.encodeText(`Cash:     ${fmt(data.cashReceived)}\n`));
      if (data.change) commands.push(this.encodeText(`Change:   ${fmt(data.change)}\n`));

      // BIR Footer
      commands.push(this.encodeText(line));
      commands.push(this.setAlign('center'));
      if (data.ptuNumber) commands.push(this.encodeText(`PTU No: ${data.ptuNumber}\n`));
      if (data.minNumber) commands.push(this.encodeText(`MIN: ${data.minNumber}\n`));
      if (data.systemProvider) commands.push(this.encodeText(`Accredited System Provider: ${data.systemProvider}\n`));
      if (data.ptuDate) commands.push(this.encodeText(`Date Issued: ${data.ptuDate}\n`));
      commands.push(this.encodeText('\n'));
      commands.push(this.encodeText((isVAT ? 'THIS SERVES AS AN OFFICIAL RECEIPT' : 'NOT VALID FOR CLAIM OF INPUT TAX') + '\n'));
      if (data.footer) {
        commands.push(this.encodeText('\n'));
        commands.push(this.encodeText(data.footer + '\n'));
      }

      // Feed and cut
      commands.push(this.feed(3));
      commands.push(this.cut());

      // Check if printer is connected before attempting to send commands
      if (!this.device || !this.config) {
        console.warn('Printer not connected, falling back to browser print');
        return this.printViaBrowser(data);
      }

      // Send all commands
      for (const cmd of commands) {
        await this.sendData(cmd);
      }

      // Kick cash drawer after print if requested (drawer connected to printer via RJ11)
      if (data.openDrawerOnPrint) {
        const kickCmd = new Uint8Array([this.ESC, 0x70, 0x00, 0x19, 0xFF]);
        await this.sendData(kickCmd);
      }

      return true;
    } catch (error) {
      logger.error('Print error:', error);
      // Fallback to browser print
      return this.printViaBrowser(data);
    }
  }

  private async printViaNetwork(data: ReceiptData): Promise<boolean> {
    if (!this.config?.ipAddress) {
      return false;
    }

    try {
      // Send ESC/POS commands via HTTP POST to printer
      const commands = await this.buildEscPosCommands(data);

      // Append cash drawer kick if requested
      let payload = commands;
      if (data.openDrawerOnPrint) {
        const kickCmd = new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFF]);
        const combined = new Uint8Array(commands.length + kickCmd.length);
        combined.set(commands);
        combined.set(kickCmd, commands.length);
        payload = combined;
      }

      const response = await fetch(`http://${this.config.ipAddress}:${this.config.portNumber || 9100}`, {
        method: 'POST',
        body: payload as unknown as BodyInit,
        headers: {
          'Content-Type': 'application/octet-stream',
        },
      });

      return response.ok;
    } catch (error) {
      logger.error('Network print error:', error);
      return false;
    }
  }

  private async buildEscPosCommands(data: ReceiptData): Promise<Uint8Array> { // eslint-disable-line @typescript-eslint/no-unused-vars
    const commands: Uint8Array[] = [];
    // Same command building as printReceipt but return as single array
    // (Implementation similar to printReceipt method)
    commands.push(this.init());
    // ... build commands ...
    commands.push(this.cut());

    // Combine all commands
    const totalLength = commands.reduce((sum, cmd) => sum + cmd.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const cmd of commands) {
      combined.set(cmd, offset);
      offset += cmd.length;
    }
    return combined;
  }

  private printViaBrowser(data: ReceiptData): boolean {
    // Use a hidden iframe instead of window.open so printing works from async
    // callbacks (after await fetch) without being blocked by popup blockers.
    const html = this.generateReceiptHTML(data);

    const iframe = document.createElement('iframe');
    iframe.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      return false;
    }

    doc.open();
    doc.write(html);
    doc.close();

    // Give the iframe a moment to render before triggering print
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      // Clean up after the print dialog closes (browsers hold the call
      // synchronously while the dialog is open, so 500 ms is enough)
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 500);
    }, 250);

    return true;
  }

  private generateReceiptHTML(data: ReceiptData): string {
    // If custom template is provided, use it
    if (data.template) {
      try {
        // Import template rendering function dynamically to avoid circular dependencies
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { renderReceiptTemplate } = require('@/lib/receipt-templates');
        return renderReceiptTemplate(data.template, data);
      } catch (error) {
        logger.error('Error rendering receipt template:', error);
        // Fall through to default template
      }
    }

    // BIR-compliant default template
    const fmt = (n: number) => n.toFixed(2);
    const taxLabel = data.taxLabel || 'Tax';
    const isVAT = data.isVAT ?? (taxLabel.toUpperCase().includes('VAT') && !!data.tax);
    const vatAmount = data.tax ?? 0;
    // VATable sales = amount before VAT (net of discount)
    const discountedSubtotal = data.subtotal - (data.discount ?? 0);
    const vatableSales = isVAT && vatAmount > 0 ? discountedSubtotal - vatAmount : 0;
    const vatExemptSales = isVAT ? 0 : discountedSubtotal;

    // Use tenant-configured tax rate; never back-calculate from amounts (rounding errors)
    const vatPct = data.taxRate ? String(data.taxRate) : '12';

    return `<!DOCTYPE html>
<html>
<head>
  <title>Official Receipt</title>
  <style>
    @media print {
      @page { margin: 0; size: 80mm auto; }
      body { margin: 0; padding: 10px; }
    }
    body {
      font-family: 'Courier New', monospace;
      font-size: 11px;
      width: 80mm;
      margin: 0 auto;
      padding: 10px;
    }
    h2 { font-size: 14px; margin: 0 0 4px 0; font-weight: bold; }
    .center { text-align: center; }
    .header { border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
    .item { display: flex; justify-content: space-between; margin-bottom: 4px; }
    .total { border-top: 2px dashed #000; padding-top: 8px; margin-top: 8px; font-weight: bold; }
    .small { font-size: 9px; }
    .footer { text-align: center; margin-top: 15px; font-size: 9px; }
  </style>
</head>
<body>
  <div class="header center">
    ${data.logo ? `<img src="${data.logo}" alt="Logo" style="max-width:100px;max-height:60px;display:block;margin:0 auto 4px;" />` : ''}
    ${data.storeName ? `<h2>${data.storeName}</h2>` : ''}
    ${data.businessStyle ? `<div>${data.businessStyle}</div>` : ''}
    ${data.address ? `<div>${data.address}</div>` : ''}
    ${data.phone ? `<div>${data.phone}</div>` : ''}
    ${data.tin ? `<div>TIN: ${data.tin}</div>` : ''}
    <div>${isVAT ? 'VAT' : 'NON-VAT'} Registered</div>
    <br>
    <div><strong>OFFICIAL RECEIPT</strong></div>
    <div>Serial No: ${data.receiptNumber}</div>
    <div>Date: ${data.date}${data.time ? ' ' + data.time : ''}</div>
  </div>

  ${data.customerName ? `
  <div class="small">
    Customer: ${data.customerName}<br>
    ${data.customerTIN ? `TIN: ${data.customerTIN}<br>` : ''}
  </div>
  <br>` : ''}

  ${data.items.map(item => `
  <div class="item">
    <div>
      ${item.name} x${item.quantity}<br>
      <span class="small">@ ${fmt(item.price)}</span>
    </div>
    <div>${fmt(item.subtotal)}</div>
  </div>`).join('')}

  <div class="total">
    <div class="item"><div>Subtotal:</div><div>${fmt(data.subtotal)}</div></div>
    ${data.discount ? `<div class="item"><div>Discount:</div><div>-${fmt(data.discount)}</div></div>` : ''}
    ${isVAT ? `
    <div class="item"><div>VATable Sales:</div><div>${fmt(vatableSales)}</div></div>
    <div class="item"><div>${taxLabel} (${vatPct}%):</div><div>${fmt(vatAmount)}</div></div>
    <div class="item"><div>VAT-Exempt Sales:</div><div>${fmt(vatExemptSales)}</div></div>
    ` : `
    <div class="item"><div>VAT-Exempt Sales:</div><div>${fmt(discountedSubtotal)}</div></div>
    `}
    <div class="item"><div><strong>TOTAL:</strong></div><div>${fmt(data.total)}</div></div>
    <div class="item"><div>Payment:</div><div>${data.paymentMethod.toUpperCase()}</div></div>
    ${data.cashReceived ? `<div class="item"><div>Cash:</div><div>${fmt(data.cashReceived)}</div></div>` : ''}
    ${data.change ? `<div class="item"><div>Change:</div><div>${fmt(data.change)}</div></div>` : ''}
  </div>

  <div class="footer">
    ${data.ptuNumber ? `<div>PTU No: ${data.ptuNumber}</div>` : ''}
    ${data.minNumber ? `<div>MIN: ${data.minNumber}</div>` : ''}
    ${data.systemProvider ? `<div>Accredited System Provider: ${data.systemProvider}</div>` : ''}
    ${data.ptuDate ? `<div>Date Issued: ${data.ptuDate}</div>` : ''}
    <br>
    <div class="small">${isVAT ? 'THIS SERVES AS AN OFFICIAL RECEIPT' : 'THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX'}</div>
    ${data.footer ? `<br><div class="small">${data.footer}</div>` : ''}
  </div>
</body>
</html>`;
  }

  /**
   * Open cash drawer via server-side proxy API.
   * Falls back to triggering a blank browser print (some printers auto-kick drawer on print).
   */
  private async openDrawerViaPrintProxy(): Promise<boolean> {
    // Try server-side proxy first (for network printers)
    try {
      const res = await fetch('/api/hardware/cash-drawer-kick', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) return true;
      }
    } catch {
      // Proxy not available, fall through
    }

    // Fallback: print a blank page. Many POS printers have a DIP switch
    // or driver setting to auto-open drawer on any print job.
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      return false;
    }
    doc.open();
    doc.write('<html><body style="margin:0;padding:0;"><div style="height:1px;"></div></body></html>');
    doc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
      }, 500);
    }, 100);
    return true;
  }

  async openCashDrawer(): Promise<boolean> {
    try {
      if (this.config?.type === 'browser') {
        // Browser print mode: try server-side proxy for network printers,
        // or trigger a blank print (some printers auto-kick drawer on any print job).
        return this.openDrawerViaPrintProxy();
      }

      // ESC/POS command to open cash drawer (pulse pin 2)
      const command = new Uint8Array([
        this.ESC, 0x70, 0x00, 0x19, 0xFF // ESC p m t1 t2
      ]);

      if (this.config?.type === 'network' && this.config.ipAddress) {
        const response = await fetch(
          `http://${this.config.ipAddress}:${this.config.portNumber || 9100}`,
          {
            method: 'POST',
            body: command,
            headers: { 'Content-Type': 'application/octet-stream' },
          }
        );
        return response.ok;
      }

      // USB printer: connect if not already (works when called from user gesture like button click).
      // If called outside a user gesture, connect() will fail gracefully.
      if (!this.device) {
        try {
          const connected = await this.connect();
          if (!connected) {
            logger.info('Cash drawer: Printer not connected. Use Hardware Settings to pair first.');
            return false;
          }
        } catch {
          logger.info('Cash drawer: Could not connect to printer.');
          return false;
        }
      }

      await this.sendData(command);
      return true;
    } catch (error) {
      logger.error('Failed to open cash drawer:', error);
      return false;
    }
  }
}

export const receiptPrinterService = new ReceiptPrinterService();

