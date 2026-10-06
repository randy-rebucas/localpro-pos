'use client';

import { useState, useEffect } from 'react';
import { hardwareService, HardwareConfig, PrinterConfig, PRINTER_PROFILES } from '@/lib/hardware';
import PrinterDetectionPanel from '@/components/hardware/PrinterDetectionPanel';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';
import { showToast } from '@/lib/toast';

interface HardwareSettingsProps {
  onClose?: () => void;
  hideSaveButton?: boolean;
  config?: HardwareConfig;
  onChange?: (config: HardwareConfig) => void;
}

const INPUT = 'w-full border border-gray-300 px-3 py-2 text-sm bg-white disabled:bg-gray-100';
const LABEL = 'block text-xs font-medium text-gray-600 mb-1';
const SECONDARY_BTN =
  'inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 disabled:opacity-50 transition-colors';

function Section({ title, hint, action, children }: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-gray-300">
      <div className="px-6 py-4 border-b border-gray-300 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          {hint && <p className="text-sm text-gray-500">{hint}</p>}
        </div>
        {action}
      </div>
      <div className="p-6 space-y-4">{children}</div>
    </section>
  );
}

export default function HardwareSettings({
  onClose,
  hideSaveButton = false,
  config: externalConfig,
  onChange
}: HardwareSettingsProps) {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = (params?.lang as 'en' | 'es') || 'en';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [internalConfig, setInternalConfig] = useState<HardwareConfig>({});
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState<{
    printers: Array<{ name: string; type: string }>;
    cameras: Array<{ deviceId: string; label: string }>;
  }>({ printers: [], cameras: [] });
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  // Use external config if provided, otherwise use internal state
  const config = externalConfig !== undefined ? externalConfig : internalConfig;
  const setConfig = onChange || setInternalConfig;

  useEffect(() => {
    if (externalConfig === undefined) {
      // Only load from localStorage if not controlled by parent
      loadConfig();
    }
    detectCameras();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  const loadConfig = () => {
    const hardwareConfigKey = `hardware_config_${tenant}`;
    const savedConfig = localStorage.getItem(hardwareConfigKey);
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        setInternalConfig(parsed);
        hardwareService.setConfig(parsed);
      } catch (error) {
        console.error('Failed to load hardware config:', error);
      }
    }
  };

  const saveConfig = async () => {
    setLoading(true);
    try {
      // In uncontrolled mode (no `config`/`onChange` from a parent that owns
      // persistence — e.g. the admin hardware page), this component is the
      // only thing that can persist the change, so it must write through to
      // the tenant record, not just localStorage — otherwise the config only
      // exists in this one browser and silently never reaches other devices.
      if (externalConfig === undefined) {
        const res = await fetch(`/api/tenants/${tenant}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ hardwareConfig: config }),
        });
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || 'Failed to save hardware settings');
        }
      }
      const hardwareConfigKey = `hardware_config_${tenant}`;
      localStorage.setItem(hardwareConfigKey, JSON.stringify(config));
      await hardwareService.setConfig(config);
      showToast.success(dict?.common?.hardwareSettingsSaved || 'Hardware settings saved successfully!');
      if (onClose) onClose();
    } catch (error) {
      console.error('Failed to save hardware config:', error);
      showToast.error(error instanceof Error ? error.message : (dict?.common?.failedToSaveHardwareSettings || 'Failed to save hardware settings'));
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = (updates: Partial<HardwareConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    // Also update hardware service immediately for testing
    hardwareService.setConfig(newConfig);
  };

  const detectCameras = async () => {
    try {
      const cameras = await hardwareService.detectCameras();
      setDevices((prev) => ({ ...prev, cameras }));
    } catch (error) {
      console.error('Failed to detect cameras:', error);
    }
  };

  const dictValue = (key: string, fallback: string) =>
    dict?.components?.hardwareSettings?.[key] ?? fallback;

  const testPrinter = async () => {
    if (!config.printer) {
      showToast.error(dict?.common?.configurePrinterFirst || 'Please configure a printer first');
      return;
    }

    setTesting('printer');
    try {
      const testReceipt = {
        storeName: 'Test Store',
        receiptNumber: 'TEST-001',
        date: new Date().toLocaleString(),
        items: [
          { name: 'Test Item', quantity: 1, price: 10.00, subtotal: 10.00 },
        ],
        subtotal: 10.00,
        total: 10.00,
        paymentMethod: 'cash',
        cashReceived: 20.00,
        change: 10.00,
        footer: 'This is a test receipt',
      };

      const success = await hardwareService.printReceipt(testReceipt, { allowDevicePicker: true });
      if (success) {
        showToast.success(dict?.common?.testReceiptSent || 'Test receipt sent successfully!');
      } else {
        showToast.error(dict?.common?.failedToPrintTestReceipt || 'Failed to print test receipt');
      }
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
      if (paired) {
        showToast.success(dict?.common?.cashDrawerPaired || 'Cash drawer paired!');
      } else {
        showToast.error(dict?.common?.failedToPairCashDrawer || 'Failed to pair cash drawer');
      }
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
      if (success) {
        showToast.success(dict?.common?.cashDrawerOpened || 'Cash drawer opened!');
      } else {
        showToast.error(dict?.common?.failedToOpenCashDrawer || 'Failed to open cash drawer. Make sure it is connected to the printer.');
      }
    } catch (error) {
      console.error('Cash drawer test error:', error);
      showToast.error(dict?.common?.failedToOpenCashDrawerShort || 'Failed to open cash drawer');
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="space-y-6">
      {onClose && (
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{dictValue('title', 'Hardware Settings')}</h2>
          <button
            type="button"
            onClick={onClose}
            title={dictValue('close', 'Close')}
            aria-label={dictValue('close', 'Close')}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Receipt Printer */}
      <Section
        title={dictValue('receiptPrinter', 'Receipt Printer')}
        hint={dictValue('receiptPrinterHint', 'How receipts are printed from this POS')}
        action={
          <button type="button" onClick={testPrinter} disabled={testing === 'printer'} className={SECONDARY_BTN}>
            {testing === 'printer' ? dictValue('testing', 'Testing…') : dictValue('testPrint', 'Test Print')}
          </button>
        }
      >
        <PrinterDetectionPanel
          dictValue={dictValue}
          onApplyPrinter={(printer) =>
            updateConfig({
              printer: { ...config.printer, ...printer } as PrinterConfig,
            })
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="hw-printer-type" className={LABEL}>{dictValue('printerType', 'Printer Type')}</label>
            <select
              id="hw-printer-type"
              value={config.printer?.type || 'browser'}
              onChange={(e) => updateConfig({
                printer: {
                  ...config.printer,
                  type: e.target.value as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                  // Clear profile when switching away from USB
                  profile: e.target.value === 'usb' ? config.printer?.profile : undefined,
                } as PrinterConfig,
              })}
              className={INPUT}
            >
              <option value="browser">{dictValue('browserPrint', 'Browser Print')}</option>
              <option value="usb">{dictValue('usbPrinter', 'USB Printer')}</option>
              <option value="serial">{dictValue('serialPrinter', 'Serial Printer')}</option>
              <option value="network">{dictValue('networkPrinter', 'Network Printer')}</option>
            </select>
          </div>

          {config.printer?.type === 'usb' && (
            <div>
              <label htmlFor="hw-printer-model" className={LABEL}>{dictValue('printerModel', 'Printer Model')}</label>
              <select
                id="hw-printer-model"
                value={config.printer?.profile || ''}
                onChange={(e) => {
                  const profile = PRINTER_PROFILES.find((p) => p.id === e.target.value);
                  updateConfig({
                    printer: {
                      ...config.printer,
                      type: 'usb',
                      profile: profile?.id,
                      // Auto-fill IDs from the profile; clear if switching to generic
                      vendorId: profile?.vendorId,
                      productId: profile?.productId,
                    } as PrinterConfig,
                  });
                }}
                className={INPUT}
              >
                <option value="">{dictValue('selectModel', '— Select model —')}</option>
                {PRINTER_PROFILES.filter((p) => p.type === 'usb').map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {config.printer?.type === 'network' && (
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label htmlFor="hw-printer-ip" className={LABEL}>{dictValue('ipAddress', 'IP Address')}</label>
              <input
                id="hw-printer-ip"
                type="text"
                value={config.printer?.ipAddress || ''}
                onChange={(e) => updateConfig({
                  printer: {
                    ...config.printer,
                    ipAddress: e.target.value,
                  } as PrinterConfig,
                })}
                placeholder="192.168.1.100"
                className={`${INPUT} font-mono`}
              />
            </div>
            <div>
              <label htmlFor="hw-printer-port" className={LABEL}>{dictValue('port', 'Port')}</label>
              <input
                id="hw-printer-port"
                type="number"
                value={config.printer?.portNumber || 9100}
                onChange={(e) => updateConfig({
                  printer: {
                    ...config.printer,
                    portNumber: parseInt(e.target.value),
                  } as PrinterConfig,
                })}
                className={`${INPUT} font-mono tabular-nums`}
              />
            </div>
          </div>
        )}
      </Section>

      {/* Cash Drawer */}
      <Section
        title={dictValue('cashDrawer', 'Cash Drawer')}
        hint={dictValue('cashDrawerHint', 'Open the drawer on cash sales, via the printer or a direct connection')}
        action={config.cashDrawer?.enabled ? (
          <button type="button" onClick={testCashDrawer} disabled={testing === 'drawer'} className={SECONDARY_BTN}>
            {testing === 'drawer' ? dictValue('testing', 'Testing…') : dictValue('testCashDrawer', 'Test Cash Drawer')}
          </button>
        ) : undefined}
      >
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={config.cashDrawer?.enabled || false}
            onChange={(e) => updateConfig({
              cashDrawer: {
                ...config.cashDrawer,
                enabled: e.target.checked,
                connectedToPrinter: config.cashDrawer?.connectedToPrinter || false,
              },
            })}
            className="checkbox-win8"
          />
          {dictValue('enableCashDrawer', 'Enable Cash Drawer')}
        </label>
        {config.cashDrawer?.enabled && (
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={config.cashDrawer?.connectedToPrinter || false}
              onChange={(e) => updateConfig({
                cashDrawer: {
                  ...config.cashDrawer,
                  enabled: config.cashDrawer?.enabled ?? false,
                  connectedToPrinter: e.target.checked,
                },
              })}
              className="checkbox-win8"
            />
            {dictValue('connectedToPrinter', 'Connected to Printer')}
          </label>
        )}
        {config.cashDrawer?.enabled && !config.cashDrawer?.connectedToPrinter && (
          <div className="border border-gray-300 bg-gray-50 p-4 space-y-3">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="w-40">
                <label htmlFor="hw-drawer-connection" className={LABEL}>{dictValue('connectionType', 'Connection Type')}</label>
                <select
                  id="hw-drawer-connection"
                  value={config.cashDrawer?.direct?.type || 'usb'}
                  onChange={(e) => updateConfig({
                    cashDrawer: {
                      ...config.cashDrawer,
                      enabled: config.cashDrawer?.enabled ?? false,
                      connectedToPrinter: false,
                      direct: { ...config.cashDrawer?.direct, type: e.target.value as 'usb' | 'serial' },
                    },
                  })}
                  className={INPUT}
                >
                  <option value="usb">USB</option>
                  <option value="serial">Serial</option>
                </select>
              </div>
              <button type="button" onClick={pairCashDrawer} disabled={testing === 'drawer-pair'} className={SECONDARY_BTN}>
                {testing === 'drawer-pair' ? dictValue('pairing', 'Pairing…') : dictValue('pairCashDrawer', 'Pair Cash Drawer')}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              {dictValue('directCashDrawerHint', 'Pair once per device — the browser will prompt you to select the drawer.')}
            </p>
          </div>
        )}
      </Section>

      {/* Barcode Scanner */}
      <Section
        title={dictValue('barcodeScanner', 'Barcode Scanner')}
        hint={dictValue('barcodeScannerHint', 'Most USB barcode scanners work as keyboard input. Just scan a barcode to add products to cart.')}
      >
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={config.barcodeScanner?.enabled || false}
            onChange={(e) => updateConfig({
              barcodeScanner: {
                type: 'keyboard',
                enabled: e.target.checked,
              },
            })}
            className="checkbox-win8"
          />
          {dictValue('enableBarcodeScanner', 'Enable Barcode Scanner (Keyboard Input)')}
        </label>
      </Section>

      {/* QR Code Reader */}
      <Section
        title={dictValue('qrCodeReader', 'QR Code Reader')}
        hint={dictValue('qrCodeReaderHint', 'Scan QR codes with a camera on this device')}
      >
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={config.qrReader?.enabled || false}
            onChange={(e) => updateConfig({
              qrReader: {
                enabled: e.target.checked,
                cameraId: config.qrReader?.cameraId,
              },
            })}
            className="checkbox-win8"
          />
          {dictValue('enableQRCodeReader', 'Enable QR Code Reader')}
        </label>
        {config.qrReader?.enabled && devices.cameras.length > 0 && (
          <div className="sm:w-1/2">
            <label htmlFor="hw-qr-camera" className={LABEL}>{dictValue('camera', 'Camera')}</label>
            <select
              id="hw-qr-camera"
              value={config.qrReader?.cameraId || ''}
              onChange={(e) => updateConfig({
                qrReader: {
                  enabled: config.qrReader?.enabled ?? false,
                  cameraId: e.target.value,
                },
              })}
              className={INPUT}
            >
              <option value="">{dictValue('defaultCamera', 'Default Camera')}</option>
              {devices.cameras.map((camera) => (
                <option key={camera.deviceId} value={camera.deviceId}>
                  {camera.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </Section>

      {/* Touchscreen */}
      <Section
        title={dictValue('touchscreenDisplay', 'Touchscreen Display')}
        hint={dictValue('touchscreenHint', 'Larger touch targets for touch-only terminals')}
      >
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={config.touchscreen?.enabled || false}
            onChange={(e) => updateConfig({
              touchscreen: {
                enabled: e.target.checked,
              },
            })}
            className="checkbox-win8"
          />
          {dictValue('enableTouchscreenOptimizations', 'Enable Touchscreen Optimizations')}
        </label>
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2.5 h-2.5 ${hardwareService.isTouchscreen() ? 'bg-win8-success' : 'bg-gray-300'}`} aria-hidden="true" />
          <p className="text-xs text-gray-500">
            {hardwareService.isTouchscreen()
              ? dictValue('touchscreenDetected', 'Touchscreen detected. Optimizations will be applied.')
              : dictValue('noTouchscreenDetected', 'No touchscreen detected. This device may not support touch input.')}
          </p>
        </div>
      </Section>

      {!hideSaveButton && (
        <div className="bg-white border border-gray-300 p-4 flex justify-end gap-3">
          {onClose && (
            <button type="button" onClick={onClose} className={SECONDARY_BTN}>
              {dict?.common?.cancel || 'Cancel'}
            </button>
          )}
          <button
            type="button"
            onClick={saveConfig}
            disabled={loading}
            className="inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            {loading ? dictValue('saving', 'Saving…') : dictValue('saveSettings', 'Save Settings')}
          </button>
        </div>
      )}
    </div>
  );
}
