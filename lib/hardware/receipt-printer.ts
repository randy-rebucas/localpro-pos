/**
 * Receipt Printer Service
 * Supports ESC/POS printers via WebUSB, Serial API, or network printing
 */

// Web API types (available in browsers that support these APIs)
// Using eslint-disable for browser APIs that may not have complete type definitions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type USBDevice = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SerialPort = any;

export interface PrinterConfig {
  type: 'usb' | 'serial' | 'network' | 'browser';
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const device = await (navigator as any).usb.requestDevice({
          filters: this.config.vendorId && this.config.productId
            ? [{ vendorId: this.config.vendorId, productId: this.config.productId }]
            : [],
        });
        await device.open();
        await device.selectConfiguration(1);
        await device.claimInterface(0);
        this.device = device;
        return true;
      } else if (this.config.type === 'serial' && 'serial' in navigator) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const port = await (navigator as any).serial.requestPort();
        await port.open({ baudRate: 9600 });
        this.device = port;
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to connect to printer:', error);
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

  private async sendData(data: Uint8Array): Promise<void> {
    if (!this.device || !this.config) {
      // Throw error to be caught by printReceipt's try-catch for fallback
      throw new Error('Printer not connected');
    }

    try {
      if (this.config.type === 'usb') {
        await (this.device as USBDevice).transferOut(1, data);
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
        // Fallback to browser print dialog
        return await this.printViaBrowser(data);
      }

      if (!this.device && this.config && this.config.type !== 'network') {
        const connected = await this.connect();
        if (!connected) {
          console.warn('Could not connect to printer, falling back to browser print');
          return await this.printViaBrowser(data);
        }
      }

      if (this.config?.type === 'network') {
        return this.printViaNetwork(data);
      }

      // Build ESC/POS commands
      const commands: Uint8Array[] = [];

      // Initialize
      commands.push(this.init());

      // Header
      commands.push(this.setAlign('center'));
      commands.push(this.setFontSize('large'));
      commands.push(this.setBold(true));
      if (data.storeName) {
        commands.push(this.encodeText(data.storeName + '\n'));
      }
      commands.push(this.setFontSize('normal'));
      commands.push(this.setBold(false));
      if (data.address) {
        commands.push(this.encodeText(data.address + '\n'));
      }
      if (data.phone) {
        commands.push(this.encodeText(data.phone + '\n'));
      }
      commands.push(this.encodeText('--------------------------------\n'));

      // Receipt info
      commands.push(this.setAlign('left'));
      commands.push(this.encodeText(`Receipt: ${data.receiptNumber}\n`));
      commands.push(this.encodeText(`Date: ${data.date}\n`));
      commands.push(this.encodeText('--------------------------------\n'));

      // Items
      data.items.forEach((item) => {
        const name = item.name.substring(0, 20).padEnd(20);
        const qty = `x${item.quantity}`.padStart(4);
        const price = `$${item.price.toFixed(2)}`.padStart(8);
        const subtotal = `$${item.subtotal.toFixed(2)}`.padStart(10);
        commands.push(this.encodeText(`${name} ${qty} ${price}\n`));
        commands.push(this.encodeText(`${subtotal}\n`));
      });

      commands.push(this.encodeText('--------------------------------\n'));

      // Totals
      commands.push(this.setAlign('right'));
      commands.push(this.encodeText(`Subtotal: $${data.subtotal.toFixed(2)}\n`));
      if (data.tax) {
        commands.push(this.encodeText(`Tax: $${data.tax.toFixed(2)}\n`));
      }
      commands.push(this.setBold(true));
      commands.push(this.encodeText(`TOTAL: $${data.total.toFixed(2)}\n`));
      commands.push(this.setBold(false));

      commands.push(this.encodeText('--------------------------------\n'));
      commands.push(this.setAlign('left'));
      commands.push(this.encodeText(`Payment: ${data.paymentMethod}\n`));
      if (data.cashReceived) {
        commands.push(this.encodeText(`Cash: $${data.cashReceived.toFixed(2)}\n`));
      }
      if (data.change) {
        commands.push(this.encodeText(`Change: $${data.change.toFixed(2)}\n`));
      }

      // Footer
      if (data.footer) {
        commands.push(this.encodeText('--------------------------------\n'));
        commands.push(this.setAlign('center'));
        commands.push(this.encodeText(data.footer + '\n'));
      }

      // Feed and cut
      commands.push(this.feed(3));
      commands.push(this.cut());

      // Check if printer is connected before attempting to send commands
      if (!this.device || !this.config) {
        console.warn('Printer not connected, falling back to browser print');
        return await this.printViaBrowser(data);
      }

      // Send all commands
      for (const cmd of commands) {
        await this.sendData(cmd);
      }

      return true;
    } catch (error) {
      console.error('Print error:', error);
      // Fallback to browser print
      return await this.printViaBrowser(data);
    }
  }

  private async printViaNetwork(data: ReceiptData): Promise<boolean> {
    if (!this.config?.ipAddress) {
      return false;
    }

    try {
      // Send ESC/POS commands via HTTP POST to printer
      const commands = await this.buildEscPosCommands(data);
      const response = await fetch(`http://${this.config.ipAddress}:${this.config.portNumber || 9100}`, {
        method: 'POST',
        body: commands as unknown as BodyInit,
        headers: {
          'Content-Type': 'application/octet-stream',
        },
      });

      return response.ok;
    } catch (error) {
      console.error('Network print error:', error);
      return false;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async buildEscPosCommands(_data: ReceiptData): Promise<Uint8Array> {
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

  private async printViaBrowser(data: ReceiptData): Promise<boolean> {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      return false;
    }

    const html = await this.generateReceiptHTML(data);
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);

    return true;
  }

  private async generateReceiptHTML(data: ReceiptData): Promise<string> {
    // If custom template is provided, use it
    if (data.template) {
      try {
        // Import template rendering function dynamically to avoid circular dependencies
        const { renderReceiptTemplate } = await import('@/lib/receipt-templates');
        // Convert to the expected ReceiptData type (time is required in receipt-templates)
        const templateData: import('@/lib/receipt-templates').ReceiptData = {
          ...data,
          time: data.time || new Date().toLocaleTimeString(),
        };
        return renderReceiptTemplate(data.template, templateData);
      } catch (error) {
        console.error('Error rendering receipt template:', error);
        // Fall through to default template
      }
    }

    // Default template
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt</title>
          <style>
            @media print {
              @page { margin: 0; size: 80mm auto; }
              body { margin: 0; padding: 10px; }
            }
            body {
              font-family: 'Courier New', monospace;
              font-size: 12px;
              width: 80mm;
              margin: 0 auto;
              padding: 10px;
            }
            .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
            .item { display: flex; justify-content: space-between; margin-bottom: 5px; }
            .total { border-top: 2px dashed #000; padding-top: 10px; margin-top: 10px; font-weight: bold; }
            .footer { text-align: center; margin-top: 20px; font-size: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            ${data.storeName ? `<h2>${data.storeName}</h2>` : ''}
            ${data.logo ? `<img src="${data.logo}" alt="Logo" style="max-width: 100px; max-height: 60px;" />` : ''}
            <p>Receipt #${data.receiptNumber}</p>
            <p>${data.date}${data.time ? ` ${data.time}` : ''}</p>
            ${data.address ? `<p>${data.address}</p>` : ''}
            ${data.phone ? `<p>${data.phone}</p>` : ''}
            ${data.email ? `<p>${data.email}</p>` : ''}
            ${data.header ? `<p>${data.header}</p>` : ''}
          </div>
          ${data.items.map(item => `
            <div class="item">
              <div>
                <div>${item.name} x${item.quantity}</div>
                <div style="font-size: 10px;">@ $${item.price.toFixed(2)}</div>
              </div>
              <div>$${item.subtotal.toFixed(2)}</div>
            </div>
          `).join('')}
          <div class="total">
            <div class="item">
              <div>Subtotal:</div>
              <div>$${data.subtotal.toFixed(2)}</div>
            </div>
            ${data.discount ? `
              <div class="item">
                <div>Discount:</div>
                <div>-$${data.discount.toFixed(2)}</div>
              </div>
            ` : ''}
            ${data.tax ? `
              <div class="item">
                <div>${data.taxLabel || 'Tax'}:</div>
                <div>$${data.tax.toFixed(2)}</div>
              </div>
            ` : ''}
            <div class="item">
              <div>TOTAL:</div>
              <div>$${data.total.toFixed(2)}</div>
            </div>
            <div class="item">
              <div>Payment:</div>
              <div>${data.paymentMethod}</div>
            </div>
            ${data.cashReceived ? `
              <div class="item">
                <div>Cash:</div>
                <div>$${data.cashReceived.toFixed(2)}</div>
              </div>
            ` : ''}
            ${data.change ? `
              <div class="item">
                <div>Change:</div>
                <div>$${data.change.toFixed(2)}</div>
              </div>
            ` : ''}
          </div>
          ${data.footer ? `<div class="footer">${data.footer}</div>` : ''}
        </body>
      </html>
    `;
  }

  async openCashDrawer(): Promise<boolean> {
    try {
      if (this.config?.type === 'browser' || !this.device) {
        return false;
      }

      // ESC/POS command to open cash drawer (pulse pin 2)
      const command = new Uint8Array([
        this.ESC, 0x70, 0x00, 0x19, 0xFF // ESC p m t1 t2
      ]);

      await this.sendData(command);
      return true;
    } catch (error) {
      console.error('Failed to open cash drawer:', error);
      return false;
    }
  }
}

export const receiptPrinterService = new ReceiptPrinterService();

