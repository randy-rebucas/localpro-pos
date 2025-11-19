'use client';

import { useState, useEffect } from 'react';
import { hardwareService, HardwareConfig, PrinterConfig } from '@/lib/hardware';
import { useParams } from 'next/navigation';

interface HardwareSettingsProps {
  onClose?: () => void;
}

export default function HardwareSettings({ onClose }: HardwareSettingsProps) {
  const params = useParams();
  const tenant = params.tenant as string;
  const [config, setConfig] = useState<HardwareConfig>({});
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState<{
    printers: Array<{ name: string; type: string }>;
    cameras: Array<{ deviceId: string; label: string }>;
  }>({ printers: [], cameras: [] });
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
    detectDevices();
  }, [tenant]);

  const loadConfig = () => {
    const hardwareConfigKey = `hardware_config_${tenant}`;
    const savedConfig = localStorage.getItem(hardwareConfigKey);
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        setConfig(parsed);
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
      alert('Hardware settings saved successfully!');
      if (onClose) onClose();
    } catch (error) {
      console.error('Failed to save hardware config:', error);
      alert('Failed to save hardware settings');
    } finally {
      setLoading(false);
    }
  };

  const detectDevices = async () => {
    try {
      const detected = await hardwareService.detectDevices();
      setDevices(detected);
    } catch (error) {
      console.error('Failed to detect devices:', error);
    }
  };

  const testPrinter = async () => {
    if (!config.printer) {
      alert('Please configure a printer first');
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

      const success = await hardwareService.printReceipt(testReceipt);
      if (success) {
        alert('Test receipt sent successfully!');
      } else {
        alert('Failed to print test receipt');
      }
    } catch (error) {
      console.error('Print test error:', error);
      alert('Failed to print test receipt');
    } finally {
      setTesting(null);
    }
  };

  const testCashDrawer = async () => {
    setTesting('drawer');
    try {
      const success = await hardwareService.openCashDrawer();
      if (success) {
        alert('Cash drawer opened!');
      } else {
        alert('Failed to open cash drawer. Make sure it is connected to the printer.');
      }
    } catch (error) {
      console.error('Cash drawer test error:', error);
      alert('Failed to open cash drawer');
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Hardware Settings</h2>
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
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Receipt Printer</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Printer Type
              </label>
              <select
                value={config.printer?.type || 'browser'}
                onChange={(e) => setConfig({
                  ...config,
                  printer: {
                    ...config.printer,
                    type: e.target.value as any,
                  } as PrinterConfig,
                })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="browser">Browser Print</option>
                <option value="usb">USB Printer</option>
                <option value="serial">Serial Printer</option>
                <option value="network">Network Printer</option>
              </select>
            </div>

            {config.printer?.type === 'network' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    IP Address
                  </label>
                  <input
                    type="text"
                    value={config.printer?.ipAddress || ''}
                    onChange={(e) => setConfig({
                      ...config,
                      printer: {
                        ...config.printer,
                        ipAddress: e.target.value,
                      } as PrinterConfig,
                    })}
                    placeholder="192.168.1.100"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Port
                  </label>
                  <input
                    type="number"
                    value={config.printer?.portNumber || 9100}
                    onChange={(e) => setConfig({
                      ...config,
                      printer: {
                        ...config.printer,
                        portNumber: parseInt(e.target.value),
                      } as PrinterConfig,
                    })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </>
            )}

            <button
              onClick={testPrinter}
              disabled={testing === 'printer'}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {testing === 'printer' ? 'Testing...' : 'Test Print'}
            </button>
          </div>
        </div>

        {/* Cash Drawer */}
        <div className="border-b border-gray-200 pb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Cash Drawer</h3>
          <div className="space-y-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={config.cashDrawer?.enabled || false}
                onChange={(e) => setConfig({
                  ...config,
                  cashDrawer: {
                    enabled: e.target.checked,
                    connectedToPrinter: config.cashDrawer?.connectedToPrinter || false,
                  },
                })}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Enable Cash Drawer</span>
            </label>
            {config.cashDrawer?.enabled && (
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={config.cashDrawer?.connectedToPrinter || false}
                  onChange={(e) => setConfig({
                    ...config,
                    cashDrawer: {
                      ...config.cashDrawer,
                      connectedToPrinter: e.target.checked,
                    },
                  })}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">Connected to Printer</span>
              </label>
            )}
            {config.cashDrawer?.enabled && (
              <button
                onClick={testCashDrawer}
                disabled={testing === 'drawer'}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {testing === 'drawer' ? 'Testing...' : 'Test Cash Drawer'}
              </button>
            )}
          </div>
        </div>

        {/* Barcode Scanner */}
        <div className="border-b border-gray-200 pb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Barcode Scanner</h3>
          <div className="space-y-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={config.barcodeScanner?.enabled || false}
                onChange={(e) => setConfig({
                  ...config,
                  barcodeScanner: {
                    type: 'keyboard',
                    enabled: e.target.checked,
                  },
                })}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Enable Barcode Scanner (Keyboard Input)</span>
            </label>
            <p className="text-xs text-gray-500">
              Most USB barcode scanners work as keyboard input. Just scan a barcode to add products to cart.
            </p>
          </div>
        </div>

        {/* QR Code Reader */}
        <div className="border-b border-gray-200 pb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">QR Code Reader</h3>
          <div className="space-y-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={config.qrReader?.enabled || false}
                onChange={(e) => setConfig({
                  ...config,
                  qrReader: {
                    enabled: e.target.checked,
                    cameraId: config.qrReader?.cameraId,
                  },
                })}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Enable QR Code Reader</span>
            </label>
            {config.qrReader?.enabled && devices.cameras.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Camera
                </label>
                <select
                  value={config.qrReader?.cameraId || ''}
                  onChange={(e) => setConfig({
                    ...config,
                    qrReader: {
                      ...config.qrReader,
                      cameraId: e.target.value,
                    },
                  })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Default Camera</option>
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
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Touchscreen Display</h3>
          <div className="space-y-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={config.touchscreen?.enabled || false}
                onChange={(e) => setConfig({
                  ...config,
                  touchscreen: {
                    enabled: e.target.checked,
                  },
                })}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Enable Touchscreen Optimizations</span>
            </label>
            <p className="text-xs text-gray-500">
              {hardwareService.isTouchscreen() 
                ? 'Touchscreen detected. Optimizations will be applied.'
                : 'No touchscreen detected. This device may not support touch input.'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-4 mt-6">
        {onClose && (
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        )}
        <button
          onClick={saveConfig}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

