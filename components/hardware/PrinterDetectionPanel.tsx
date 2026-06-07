'use client';

import { useState } from 'react';
import {
  hardwareService,
  printerConfigFromDetected,
  type DetectedPrinter,
  type PrinterSetupRecommendation,
} from '@/lib/hardware';
import { showToast } from '@/lib/toast';
import { hardwareStatusChecker } from '@/lib/hardware/status-checker';

interface PrinterDetectionPanelProps {
  dictValue: (key: string, fallback: string) => string;
  primaryColor: string;
  onApplyPrinter: (printer: PrinterSetupRecommendation['printer']) => void;
}

function formatVidPid(vendorId?: number, productId?: number): string | null {
  if (vendorId === undefined) return null;
  const vid = `0x${vendorId.toString(16).padStart(4, '0').toUpperCase()}`;
  if (productId === undefined) return vid;
  const pid = `0x${productId.toString(16).padStart(4, '0').toUpperCase()}`;
  return `${vid}:${pid}`;
}

function statusBadgeClass(status: DetectedPrinter['probeStatus']): string {
  switch (status) {
    case 'ready':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'os_driver_claimed':
      return 'bg-amber-100 text-amber-900 border-amber-200';
    case 'unsupported':
      return 'bg-gray-100 text-gray-700 border-gray-200';
    default:
      return 'bg-red-100 text-red-800 border-red-200';
  }
}

function statusLabel(status: DetectedPrinter['probeStatus'], dictValue: PrinterDetectionPanelProps['dictValue']): string {
  switch (status) {
    case 'ready':
      return dictValue('statusReady', 'Ready');
    case 'os_driver_claimed':
      return dictValue('statusOsDriver', 'Blocked by OS driver');
    case 'unsupported':
      return dictValue('statusUnsupported', 'Unsupported');
    default:
      return dictValue('statusError', 'Error');
  }
}

export default function PrinterDetectionPanel({
  dictValue,
  primaryColor,
  onApplyPrinter,
}: PrinterDetectionPanelProps) {
  const [scanning, setScanning] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [detected, setDetected] = useState<DetectedPrinter[]>([]);
  const [recommendation, setRecommendation] = useState<PrinterSetupRecommendation | null>(null);
  const [scanned, setScanned] = useState(false);

  const runScan = async (requestNewUsb: boolean) => {
    if (requestNewUsb) setPairing(true);
    else setScanning(true);
    try {
      const devices = await hardwareService.detectPrinters({ requestNewUsb });
      setDetected(devices);
      setRecommendation(hardwareService.recommendPrinterSetup(devices));
      setScanned(true);
      hardwareStatusChecker.clearCache();
    } catch (error) {
      console.error('Printer detection failed:', error);
      showToast.error(dictValue('detectFailed', 'Failed to detect printers'));
    } finally {
      setScanning(false);
      setPairing(false);
    }
  };

  const applyRecommendation = () => {
    if (!recommendation) return;
    onApplyPrinter(recommendation.printer);
    showToast.success(dictValue('setupApplied', 'Printer setup applied'));
  };

  const applyDevice = (device: DetectedPrinter) => {
    const rec = printerConfigFromDetected(device);
    if (!rec) {
      showToast.error(dictValue('cannotUseDevice', 'This device cannot be used for direct printing'));
      return;
    }
    onApplyPrinter(rec.printer);
    showToast.success(dictValue('setupApplied', 'Printer setup applied'));
  };

  return (
    <div className="rounded border border-gray-200 bg-gray-50 p-4 mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">
            {dictValue('detectDevices', 'Detect Devices')}
          </h4>
          <p className="text-xs text-gray-500 mt-0.5">
            {dictValue(
              'detectDevicesHint',
              'Scan paired printers or pair a new USB device, then apply the recommended setup.'
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => runScan(false)}
            disabled={scanning || pairing}
            className="px-3 py-1.5 text-xs font-semibold text-white border disabled:opacity-50"
            style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
          >
            {scanning
              ? dictValue('scanning', 'Scanning...')
              : dictValue('scanForPrinters', 'Scan for printers')}
          </button>
          {'usb' in navigator && (
            <button
              type="button"
              onClick={() => runScan(true)}
              disabled={scanning || pairing}
              className="px-3 py-1.5 text-xs font-semibold border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              {pairing
                ? dictValue('pairing', 'Pairing...')
                : dictValue('pairUsbPrinter', 'Pair USB printer')}
            </button>
          )}
        </div>
      </div>

      {scanned && detected.length === 0 && (
        <p className="text-sm text-gray-600 mb-3">
          {dictValue(
            'noPrintersFound',
            'No printers found. Try Pair USB printer, or use Browser Print / Network printer.'
          )}
        </p>
      )}

      {detected.length > 0 && (
        <div className="space-y-2 mb-3">
          <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">
            {dictValue('detectedDevices', 'Detected devices')}
          </p>
          {detected.map((device) => {
            const ids = formatVidPid(device.vendorId, device.productId);
            return (
              <div
                key={device.id}
                className="flex flex-wrap items-center justify-between gap-2 border border-gray-200 bg-white p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{device.label}</p>
                  <p className="text-xs text-gray-500">
                    {device.connection.toUpperCase()}
                    {ids ? ` · ${ids}` : ''}
                    {device.matchedProfileName ? ` · ${device.matchedProfileName}` : ''}
                  </p>
                  {device.probeMessage && (
                    <p className="text-xs text-gray-500 mt-0.5">{device.probeMessage}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 border ${statusBadgeClass(device.probeStatus)}`}
                  >
                    {statusLabel(device.probeStatus, dictValue)}
                  </span>
                  {device.probeStatus !== 'unsupported' && (
                    <button
                      type="button"
                      onClick={() => applyDevice(device)}
                      className="text-xs font-semibold text-gray-700 hover:text-gray-900 underline"
                    >
                      {dictValue('useThisPrinter', 'Use this printer')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {recommendation && (
        <div className="border border-teal-200 bg-teal-50/60 p-3">
          <p className="text-sm text-gray-800 mb-2">{recommendation.summary}</p>
          <button
            type="button"
            onClick={applyRecommendation}
            className="px-3 py-1.5 text-xs font-bold text-white border"
            style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
          >
            {dictValue('useRecommendedSetup', 'Use recommended setup')}
          </button>
        </div>
      )}
    </div>
  );
}
