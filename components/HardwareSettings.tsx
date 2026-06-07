'use client';

import { useState, useEffect } from 'react';
import { hardwareService, HardwareConfig, PrinterConfig, PRINTER_PROFILES } from '@/lib/hardware';
import PrinterDetectionPanel from '@/components/hardware/PrinterDetectionPanel';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import { showToast } from '@/lib/toast';

interface HardwareSettingsProps {
  onClose?: () => void;
  hideSaveButton?: boolean;
  config?: HardwareConfig;
  onChange?: (config: HardwareConfig) => void;
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
  const { settings } = useTenantSettings();
  const primaryColor = (settings || getDefaultTenantSettings()).primaryColor || '#35979c';

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
      const hardwareConfigKey = `hardware_config_${tenant}`;
      localStorage.setItem(hardwareConfigKey, JSON.stringify(config));
      await hardwareService.setConfig(config);
      showToast.success(dict?.common?.hardwareSettingsSaved || 'Hardware settings saved successfully!');
      if (onClose) onClose();
    } catch (error) {
      console.error('Failed to save hardware config:', error);
      showToast.error(dict?.common?.failedToSaveHardwareSettings || 'Failed to save hardware settings');
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
    <div className="bg-white border border-gray-300 p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">{dict?.components?.hardwareSettings?.title || 'Hardware Settings'}</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="space-y-6">
        {/* Receipt Printer */}
        <div className="border-b border-gray-200 pb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{dict?.components?.hardwareSettings?.receiptPrinter || 'Receipt Printer'}</h3>
          <div className="space-y-4">
            <PrinterDetectionPanel
              dictValue={dictValue}
              primaryColor={primaryColor}
              onApplyPrinter={(printer) =>
                updateConfig({
                  printer: { ...config.printer, ...printer } as PrinterConfig,
                })
              }
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {dict?.components?.hardwareSettings?.printerType || 'Printer Type'}
              </label>
              <select
                value={config.printer?.type || 'browser'}
                onChange={(e) => updateConfig({
                  printer: {
                    ...config.printer,
                    type: e.target.value as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                    // Clear profile when switching away from USB
                    profile: e.target.value === 'usb' ? config.printer?.profile : undefined,
                  } as PrinterConfig,
                })}
                className="w-full px-4 py-2 border border-gray-300 bg-white"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = primaryColor;
                  e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}30`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#d1d5db';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <option value="browser">{dict?.components?.hardwareSettings?.browserPrint || 'Browser Print'}</option>
                <option value="usb">{dict?.components?.hardwareSettings?.usbPrinter || 'USB Printer'}</option>
                <option value="serial">{dict?.components?.hardwareSettings?.serialPrinter || 'Serial Printer'}</option>
                <option value="network">{dict?.components?.hardwareSettings?.networkPrinter || 'Network Printer'}</option>
              </select>
            </div>

            {config.printer?.type === 'usb' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {dict?.components?.hardwareSettings?.printerModel || 'Printer Model'}
                </label>
                <select
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
                  className="w-full px-4 py-2 border border-gray-300 bg-white"
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = primaryColor;
                    e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}30`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <option value="">{dict?.components?.hardwareSettings?.selectModel || '— Select model —'}</option>
                  {PRINTER_PROFILES.filter((p) => p.type === 'usb').map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {config.printer?.type === 'network' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {dict?.components?.hardwareSettings?.ipAddress || 'IP Address'}
                  </label>
                  <input
                    type="text"
                    value={config.printer?.ipAddress || ''}
                    onChange={(e) => updateConfig({
                      printer: {
                        ...config.printer,
                        ipAddress: e.target.value,
                      } as PrinterConfig,
                    })}
                    placeholder="192.168.1.100"
                    className="w-full px-4 py-2 border border-gray-300 bg-white"
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = primaryColor;
                      e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}30`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {dict?.components?.hardwareSettings?.port || 'Port'}
                  </label>
                  <input
                    type="number"
                    value={config.printer?.portNumber || 9100}
                    onChange={(e) => updateConfig({
                      printer: {
                        ...config.printer,
                        portNumber: parseInt(e.target.value),
                      } as PrinterConfig,
                    })}
                    className="w-full px-4 py-2 border border-gray-300 bg-white"
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = primaryColor;
                      e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}30`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>
              </>
            )}

            <button
              onClick={testPrinter}
              disabled={testing === 'printer'}
              className="px-4 py-2 text-white disabled:opacity-50 border transition-colors"
              style={{
                backgroundColor: primaryColor,
                borderColor: primaryColor
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${primaryColor}dd`; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = primaryColor; }}
            >
              {testing === 'printer' ? (dict?.components?.hardwareSettings?.testing || 'Testing...') : (dict?.components?.hardwareSettings?.testPrint || 'Test Print')}
            </button>
          </div>
        </div>

        {/* Cash Drawer */}
        <div className="border-b border-gray-200 pb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{dict?.components?.hardwareSettings?.cashDrawer || 'Cash Drawer'}</h3>
          <div className="space-y-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={config.cashDrawer?.enabled || false}
                onChange={(e) => updateConfig({
                  cashDrawer: {
                    enabled: e.target.checked,
                    connectedToPrinter: config.cashDrawer?.connectedToPrinter || false,
                  },
                })}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">{dict?.components?.hardwareSettings?.enableCashDrawer || 'Enable Cash Drawer'}</span>
            </label>
            {config.cashDrawer?.enabled && (
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={config.cashDrawer?.connectedToPrinter || false}
                  onChange={(e) => updateConfig({
                    cashDrawer: {
                      enabled: config.cashDrawer?.enabled ?? false,
                      connectedToPrinter: e.target.checked,
                    },
                  })}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">{dict?.components?.hardwareSettings?.connectedToPrinter || 'Connected to Printer'}</span>
              </label>
            )}
            {config.cashDrawer?.enabled && (
              <button
                onClick={testCashDrawer}
                disabled={testing === 'drawer'}
                className="px-4 py-2 text-white disabled:opacity-50 border transition-colors"
                style={{
                  backgroundColor: primaryColor,
                  borderColor: primaryColor
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${primaryColor}dd`; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = primaryColor; }}
              >
                {testing === 'drawer' ? (dict?.components?.hardwareSettings?.testing || 'Testing...') : (dict?.components?.hardwareSettings?.testCashDrawer || 'Test Cash Drawer')}
              </button>
            )}
          </div>
        </div>

        {/* Barcode Scanner */}
        <div className="border-b border-gray-200 pb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{dict?.components?.hardwareSettings?.barcodeScanner || 'Barcode Scanner'}</h3>
          <div className="space-y-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={config.barcodeScanner?.enabled || false}
                onChange={(e) => updateConfig({
                  barcodeScanner: {
                    type: 'keyboard',
                    enabled: e.target.checked,
                  },
                })}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">{dict?.components?.hardwareSettings?.enableBarcodeScanner || 'Enable Barcode Scanner (Keyboard Input)'}</span>
            </label>
            <p className="text-xs text-gray-500">
              {dict?.components?.hardwareSettings?.barcodeScannerHint || 'Most USB barcode scanners work as keyboard input. Just scan a barcode to add products to cart.'}
            </p>
          </div>
        </div>

        {/* QR Code Reader */}
        <div className="border-b border-gray-200 pb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{dict?.components?.hardwareSettings?.qrCodeReader || 'QR Code Reader'}</h3>
          <div className="space-y-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={config.qrReader?.enabled || false}
                onChange={(e) => updateConfig({
                  qrReader: {
                    enabled: e.target.checked,
                    cameraId: config.qrReader?.cameraId,
                  },
                })}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">{dict?.components?.hardwareSettings?.enableQRCodeReader || 'Enable QR Code Reader'}</span>
            </label>
            {config.qrReader?.enabled && devices.cameras.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {dict?.components?.hardwareSettings?.camera || 'Camera'}
                </label>
                <select
                  value={config.qrReader?.cameraId || ''}
                  onChange={(e) => updateConfig({
                    qrReader: {
                      enabled: config.qrReader?.enabled ?? false,
                      cameraId: e.target.value,
                    },
                  })}
                  className="w-full px-4 py-2 border border-gray-300 bg-white"
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = primaryColor;
                    e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}30`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <option value="">{dict?.components?.hardwareSettings?.defaultCamera || 'Default Camera'}</option>
                  {devices.cameras.map((camera) => (
                    <option key={camera.deviceId} value={camera.deviceId}>
                      {camera.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Touchscreen */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{dict?.components?.hardwareSettings?.touchscreenDisplay || 'Touchscreen Display'}</h3>
          <div className="space-y-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={config.touchscreen?.enabled || false}
                onChange={(e) => updateConfig({
                  touchscreen: {
                    enabled: e.target.checked,
                  },
                })}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">{dict?.components?.hardwareSettings?.enableTouchscreenOptimizations || 'Enable Touchscreen Optimizations'}</span>
            </label>
            <p className="text-xs text-gray-500">
              {hardwareService.isTouchscreen() 
                ? (dict?.components?.hardwareSettings?.touchscreenDetected || 'Touchscreen detected. Optimizations will be applied.')
                : (dict?.components?.hardwareSettings?.noTouchscreenDetected || 'No touchscreen detected. This device may not support touch input.')}
            </p>
          </div>
        </div>
      </div>

      {!hideSaveButton && (
        <div className="flex justify-end gap-4 mt-6">
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 bg-white"
            >
              {dict?.common?.cancel || 'Cancel'}
            </button>
          )}
          <button
            onClick={saveConfig}
            disabled={loading}
            className="px-4 py-2 text-white disabled:opacity-50 border transition-colors"
            style={{
              backgroundColor: primaryColor,
              borderColor: primaryColor
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${primaryColor}dd`; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = primaryColor; }}
          >
            {loading ? (dict?.components?.hardwareSettings?.saving || 'Saving...') : (dict?.components?.hardwareSettings?.saveSettings || 'Save Settings')}
          </button>
        </div>
      )}
    </div>
  );
}

