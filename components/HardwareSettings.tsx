'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Banknote, Monitor, Printer, QrCode, ScanBarcode } from 'lucide-react';
import { hardwareService, HardwareConfig, PrinterConfig, PRINTER_PROFILES } from '@/lib/hardware';
import PrinterDetectionPanel from '@/components/hardware/PrinterDetectionPanel';
import { CHECK_ROW, CHECKBOX, HINT, INPUT, KEY, LABEL } from '@/components/admin/register-ui';
import { showToast } from '@/lib/toast';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type HardwarePort = 'printer' | 'cash-drawer' | 'barcode-scanner' | 'qr-reader' | 'touchscreen';

interface HardwareSettingsProps {
  config: HardwareConfig;
  onChange: (config: HardwareConfig) => void;
  dict: any;
  /** Store name printed on the test receipt. */
  storeName?: string;
  lang?: string;
  /** A status light for each port's heading, drawn by the page from the live status check. */
  lights?: Partial<Record<HardwarePort, ReactNode>>;
  disabled?: boolean;
}

const PRINTER_TYPES: PrinterConfig['type'][] = ['browser', 'usb', 'serial', 'network'];

/** A row of keys where exactly one is pressed, like a mode switch on the till. */
function ModeKeys<T extends string>({ name, value, options, onChange, disabled }: {
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <label
            key={o.value}
            className={`flex min-h-[44px] cursor-pointer items-center justify-center border px-2 text-center font-receipt text-xs font-medium uppercase tracking-[0.08em] transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-hover has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 ${on ? 'border-ink bg-ink text-paper-white' : 'border-ink/25 text-ink hover:bg-paper'}`}
          >
            <input type="radio" name={name} value={o.value} checked={on} disabled={disabled} onChange={() => onChange(o.value)} className="sr-only" />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}

/** One peripheral on the back panel: a numbered port label, its light, and its settings. */
function Port({ no, icon, title, light, children }: { no: string; icon: ReactNode; title: string; light?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-dashed border-ink/30 py-5 first:border-t-0 first:pt-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-2xl font-bold uppercase leading-none sm:text-3xl">
          <span className="font-receipt text-xs font-medium tracking-[0.1em] text-ink/50">{no}</span>
          <span className="text-ink/60" aria-hidden>{icon}</span>
          {title}
        </h3>
        {light}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export default function HardwareSettings({ config, onChange, dict, storeName, lang = 'en', lights = {}, disabled = false }: HardwareSettingsProps) {
  const [cameras, setCameras] = useState<Array<{ deviceId: string; label: string }>>([]);
  const [testing, setTesting] = useState<string | null>(null);
  const [touch, setTouch] = useState(false);

  const t = (key: string, fallback: string): string => dict?.components?.hardwareSettings?.[key] ?? fallback;
  const iconCls = 'h-5 w-5';

  useEffect(() => {
    setTouch(hardwareService.isTouchscreen());
    hardwareService.detectCameras().then(setCameras).catch(() => setCameras([]));
  }, []);

  const updateConfig = (updates: Partial<HardwareConfig>) => {
    const next = { ...config, ...updates };
    onChange(next);
    // Tests on this page use the settings on screen, saved or not.
    hardwareService.setConfig(next);
  };

  const setPrinter = (printer: Partial<PrinterConfig>) =>
    updateConfig({ printer: { ...config.printer, ...printer } as PrinterConfig });

  const testPrinter = async () => {
    setTesting('printer');
    try {
      const amount = 10;
      const success = await hardwareService.printReceipt(
        {
          storeName: storeName || t('testStoreName', 'Test Store'),
          receiptNumber: 'TEST-001',
          date: new Date().toLocaleString(lang === 'es' ? 'es' : 'en'),
          items: [{ name: t('testItem', 'Test Item'), quantity: 1, price: amount, subtotal: amount }],
          subtotal: amount,
          total: amount,
          paymentMethod: 'cash',
          cashReceived: 20,
          change: 10,
          footer: t('testReceiptFooter', 'This is a test receipt'),
        },
        { allowDevicePicker: true }
      );
      if (success) showToast.success(dict?.common?.testReceiptSent || 'Test receipt sent successfully!');
      else showToast.error(dict?.common?.failedToPrintTestReceipt || 'Failed to print test receipt');
    } catch (error) {
      console.error('Print test error:', error);
      showToast.error(dict?.common?.failedToPrintTestReceipt || 'Failed to print test receipt');
    } finally {
      setTesting(null);
    }
  };

  const pairCashDrawer = async () => {
    setTesting('drawer-pair');
    try {
      const paired = await hardwareService.pairDirectCashDrawer();
      if (paired) showToast.success(dict?.common?.cashDrawerPaired || 'Cash drawer paired!');
      else showToast.error(dict?.common?.failedToPairCashDrawer || 'Failed to pair cash drawer');
    } catch (error) {
      console.error('Cash drawer pairing error:', error);
      showToast.error(dict?.common?.failedToPairCashDrawer || 'Failed to pair cash drawer');
    } finally {
      setTesting(null);
    }
  };

  const testCashDrawer = async () => {
    setTesting('drawer');
    try {
      const success = await hardwareService.openCashDrawer();
      if (success) showToast.success(dict?.common?.cashDrawerOpened || 'Cash drawer opened!');
      else showToast.error(dict?.common?.failedToOpenCashDrawer || 'Failed to open cash drawer. Make sure it is connected to the printer.');
    } catch (error) {
      console.error('Cash drawer test error:', error);
      showToast.error(dict?.common?.failedToOpenCashDrawerShort || 'Failed to open cash drawer');
    } finally {
      setTesting(null);
    }
  };

  const printerType = config.printer?.type || 'browser';
  const drawer = config.cashDrawer;
  const drawerUpdate = (updates: Partial<NonNullable<HardwareConfig['cashDrawer']>>) =>
    updateConfig({ cashDrawer: { enabled: drawer?.enabled ?? false, connectedToPrinter: drawer?.connectedToPrinter ?? false, ...drawer, ...updates } });

  const printerTypeLabels: Record<PrinterConfig['type'], string> = {
    browser: t('browserPrint', 'Browser Print'),
    usb: t('usbPrinter', 'USB Printer'),
    serial: t('serialPrinter', 'Serial Printer'),
    network: t('networkPrinter', 'Network Printer'),
  };

  return (
    <div>
      <p className={`${HINT} mb-5 mt-0`}>{t('testsUseScreen', 'Test keys use the settings on screen, saved or not. Save to keep them.')}</p>

      {/* 01 Receipt printer */}
      <Port no="01" icon={<Printer className={iconCls} strokeWidth={1.75} />} title={t('receiptPrinter', 'Receipt Printer')} light={lights.printer}>
        <PrinterDetectionPanel dictValue={t} disabled={disabled} onApplyPrinter={(printer) => setPrinter(printer as PrinterConfig)} />

        <fieldset>
          <legend className={LABEL}>{t('printerType', 'Printer Type')}</legend>
          <ModeKeys
            name="printer-type"
            value={printerType}
            disabled={disabled}
            options={PRINTER_TYPES.map((v) => ({ value: v, label: printerTypeLabels[v] }))}
            onChange={(type) => setPrinter({ type, profile: type === 'usb' ? config.printer?.profile : undefined })}
          />
        </fieldset>

        {printerType === 'usb' && (
          <div>
            <label htmlFor="hw-printer-model" className={LABEL}>{t('printerModel', 'Printer Model')}</label>
            <select
              id="hw-printer-model"
              value={config.printer?.profile || ''}
              disabled={disabled}
              onChange={(e) => {
                const profile = PRINTER_PROFILES.find((p) => p.id === e.target.value);
                // Fill the USB ids from the model; picking "generic" clears them.
                setPrinter({ type: 'usb', profile: profile?.id, vendorId: profile?.vendorId, productId: profile?.productId });
              }}
              className={INPUT}
            >
              <option value="">{t('selectModel', '— Select model —')}</option>
              {PRINTER_PROFILES.filter((p) => p.type === 'usb').map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {printerType === 'network' && (
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <div>
              <label htmlFor="hw-printer-ip" className={LABEL}>{t('ipAddress', 'IP Address')}</label>
              <input
                id="hw-printer-ip"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                disabled={disabled}
                value={config.printer?.ipAddress || ''}
                onChange={(e) => setPrinter({ ipAddress: e.target.value.trim() })}
                placeholder="192.168.1.100"
                className={`${INPUT} font-receipt`}
              />
            </div>
            <div>
              <label htmlFor="hw-printer-port" className={LABEL}>{t('port', 'Port')}</label>
              <input
                id="hw-printer-port"
                type="text"
                inputMode="numeric"
                disabled={disabled}
                value={config.printer?.portNumber ?? ''}
                onChange={(e) => {
                  // Digits only; blank means the default 9100 (a NaN here used to fail the save).
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 5);
                  const port = digits ? Math.min(Number(digits), 65535) : undefined;
                  setPrinter({ portNumber: port || undefined });
                }}
                placeholder="9100"
                className={`${INPUT} font-receipt`}
              />
            </div>
          </div>
        )}

        <button type="button" onClick={testPrinter} disabled={disabled || testing === 'printer'} className={`${KEY} w-full sm:w-auto`}>
          <Printer className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {testing === 'printer' ? t('testing', 'Testing...') : t('testPrint', 'Test Print')}
        </button>
      </Port>

      {/* 02 Cash drawer */}
      <Port no="02" icon={<Banknote className={iconCls} strokeWidth={1.75} />} title={t('cashDrawer', 'Cash Drawer')} light={lights['cash-drawer']}>
        <label className={CHECK_ROW}>
          <input type="checkbox" className={CHECKBOX} disabled={disabled} checked={drawer?.enabled || false} onChange={(e) => drawerUpdate({ enabled: e.target.checked })} />
          {t('enableCashDrawer', 'Enable Cash Drawer')}
        </label>
        {drawer?.enabled && (
          <label className={CHECK_ROW}>
            <input type="checkbox" className={CHECKBOX} disabled={disabled} checked={drawer?.connectedToPrinter || false} onChange={(e) => drawerUpdate({ connectedToPrinter: e.target.checked })} />
            {t('connectedToPrinter', 'Connected to Printer')}
          </label>
        )}
        {drawer?.enabled && !drawer?.connectedToPrinter && (
          <div className="space-y-3 border-l-2 border-ink/15 pl-4">
            <fieldset>
              <legend className={LABEL}>{t('connectionType', 'Connection Type')}</legend>
              <ModeKeys
                name="drawer-connection"
                value={drawer?.direct?.type || 'usb'}
                disabled={disabled}
                options={[{ value: 'usb', label: 'USB' }, { value: 'serial', label: t('serial', 'Serial') }]}
                onChange={(type) => drawerUpdate({ connectedToPrinter: false, direct: { ...drawer?.direct, type } })}
              />
            </fieldset>
            <button type="button" onClick={pairCashDrawer} disabled={disabled || testing === 'drawer-pair'} className={`${KEY} w-full sm:w-auto`}>
              {testing === 'drawer-pair' ? t('pairing', 'Pairing...') : t('pairCashDrawer', 'Pair Cash Drawer')}
            </button>
            <p className={HINT}>{t('directCashDrawerHint', 'Pair once per device — the browser will prompt you to select the drawer.')}</p>
          </div>
        )}
        {drawer?.enabled && (
          <button type="button" onClick={testCashDrawer} disabled={disabled || testing === 'drawer'} className={`${KEY} w-full sm:w-auto`}>
            <Banknote className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {testing === 'drawer' ? t('testing', 'Testing...') : t('testCashDrawer', 'Test Cash Drawer')}
          </button>
        )}
      </Port>

      {/* 03 Barcode scanner */}
      <Port no="03" icon={<ScanBarcode className={iconCls} strokeWidth={1.75} />} title={t('barcodeScanner', 'Barcode Scanner')} light={lights['barcode-scanner']}>
        <label className={CHECK_ROW}>
          <input
            type="checkbox"
            className={CHECKBOX}
            disabled={disabled}
            checked={config.barcodeScanner?.enabled || false}
            onChange={(e) => updateConfig({ barcodeScanner: { type: 'keyboard', enabled: e.target.checked } })}
          />
          {t('enableBarcodeScanner', 'Enable Barcode Scanner (Keyboard Input)')}
        </label>
        <p className={HINT}>{t('barcodeScannerHint', 'Most USB barcode scanners work as keyboard input. Just scan a barcode to add products to cart.')}</p>
      </Port>

      {/* 04 QR code reader */}
      <Port no="04" icon={<QrCode className={iconCls} strokeWidth={1.75} />} title={t('qrCodeReader', 'QR Code Reader')} light={lights['qr-reader']}>
        <label className={CHECK_ROW}>
          <input
            type="checkbox"
            className={CHECKBOX}
            disabled={disabled}
            checked={config.qrReader?.enabled || false}
            onChange={(e) => updateConfig({ qrReader: { enabled: e.target.checked, cameraId: config.qrReader?.cameraId } })}
          />
          {t('enableQRCodeReader', 'Enable QR Code Reader')}
        </label>
        {config.qrReader?.enabled && cameras.length > 0 && (
          <div>
            <label htmlFor="hw-camera" className={LABEL}>{t('camera', 'Camera')}</label>
            <select
              id="hw-camera"
              value={config.qrReader?.cameraId || ''}
              disabled={disabled}
              onChange={(e) => updateConfig({ qrReader: { enabled: true, cameraId: e.target.value || undefined } })}
              className={INPUT}
            >
              <option value="">{t('defaultCamera', 'Default Camera')}</option>
              {cameras.map((camera) => (
                <option key={camera.deviceId} value={camera.deviceId}>{camera.label}</option>
              ))}
            </select>
          </div>
        )}
      </Port>

      {/* 05 Touchscreen */}
      <Port no="05" icon={<Monitor className={iconCls} strokeWidth={1.75} />} title={t('touchscreenDisplay', 'Touchscreen Display')} light={lights.touchscreen}>
        {/* Detection only: nothing in the register reads a touchscreen setting, so there is no switch to offer. */}
        <p className="font-receipt text-sm">
          {touch
            ? t('touchDetectedHere', 'Touch input detected on this device.')
            : t('noTouchDetectedHere', 'No touch input detected on this device.')}
        </p>
      </Port>
    </div>
  );
}
