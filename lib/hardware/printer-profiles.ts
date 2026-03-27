/**
 * Known ESC/POS printer profiles
 * vendorId / productId are USB descriptor values (verify via Device Manager if
 * auto-connect fails and the printer is brand-new/unpaired).
 */

export interface PrinterProfile {
  id: string;
  name: string;
  vendor: string;
  /** USB Vendor ID (decimal). Undefined = any USB device. */
  vendorId?: number;
  /** USB Product ID (decimal). Undefined = any product from this vendor. */
  productId?: number;
  /** Connection type implied by this profile. */
  type: 'usb' | 'serial' | 'network' | 'browser';
}

export const PRINTER_PROFILES: PrinterProfile[] = [
  // ── Generic ──────────────────────────────────────────────────────────────
  {
    id: 'generic-usb',
    name: 'Generic ESC/POS (USB)',
    vendor: 'Generic',
    type: 'usb',
  },

  // ── Custom S.p.A. ────────────────────────────────────────────────────────
  {
    id: 'custom-psd200i',
    name: 'Custom PSD 200i',
    vendor: 'Custom',
    vendorId: 0x0dd4,
    productId: 0x0003,
    type: 'usb',
  },
  {
    id: 'custom-tg2480',
    name: 'Custom TG2480',
    vendor: 'Custom',
    vendorId: 0x0dd4,
    productId: 0x0002,
    type: 'usb',
  },

  // ── Epson ────────────────────────────────────────────────────────────────
  {
    id: 'epson-tm-t88',
    name: 'Epson TM-T88 Series',
    vendor: 'Epson',
    vendorId: 0x04b8,
    productId: 0x0202,
    type: 'usb',
  },
  {
    id: 'epson-tm-t20',
    name: 'Epson TM-T20 Series',
    vendor: 'Epson',
    vendorId: 0x04b8,
    productId: 0x0e28,
    type: 'usb',
  },
  {
    id: 'epson-tm-t82',
    name: 'Epson TM-T82 Series',
    vendor: 'Epson',
    vendorId: 0x04b8,
    productId: 0x0e15,
    type: 'usb',
  },

  // ── Star ─────────────────────────────────────────────────────────────────
  {
    id: 'star-tsp100',
    name: 'Star TSP100 Series',
    vendor: 'Star',
    vendorId: 0x0519,
    productId: 0x0003,
    type: 'usb',
  },
  {
    id: 'star-tsp650',
    name: 'Star TSP650 Series',
    vendor: 'Star',
    vendorId: 0x0519,
    productId: 0x0001,
    type: 'usb',
  },

  // ── Bixolon ──────────────────────────────────────────────────────────────
  {
    id: 'bixolon-srp350',
    name: 'Bixolon SRP-350 Series',
    vendor: 'Bixolon',
    vendorId: 0x1504,
    productId: 0x0006,
    type: 'usb',
  },
  {
    id: 'bixolon-srp332',
    name: 'Bixolon SRP-332',
    vendor: 'Bixolon',
    vendorId: 0x1504,
    productId: 0x0012,
    type: 'usb',
  },

  // ── Citizen ──────────────────────────────────────────────────────────────
  {
    id: 'citizen-ct-s310',
    name: 'Citizen CT-S310 Series',
    vendor: 'Citizen',
    vendorId: 0x1d90,
    productId: 0x2060,
    type: 'usb',
  },
];

export function findProfile(id: string): PrinterProfile | undefined {
  return PRINTER_PROFILES.find((p) => p.id === id);
}
