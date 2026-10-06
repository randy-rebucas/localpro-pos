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
  onApplyPrinter: (printer: PrinterSetupRecommendation['printer']) => void;
}

function formatVidPid(vendorId?: number, productId?: number): string | null {
  if (vendorId === undefined) return null;
  const vid = `0x${vendorId.toString(16).padStart(4, '0').toUpperCase()}`;
  if (productId === undefined) return vid;
  const pid = `0x${productId.toString(16).padStart(4, '0').toUpperCase()}`;
  return `${vid}:${pid}`;
}

const PROBE_BADGE: Record<string, string> = {
  ready: 'bg-win8-success text-white',
  os_driver_claimed: 'bg-win8-warning text-white',
  unsupported: 'bg-gray-500 text-white',
};

function statusBadgeClass(status: DetectedPrinter['probeStatus']): string {
  return PROBE_BADGE[status] || 'bg-win8-danger text-white';
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
    <div className="border border-gray-300 bg-gray-50 p-4">
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
            className="inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            {scanning
              ? dictValue('scanning', 'Scanning…')
              : dictValue('scanForPrinters', 'Scan for printers')}
          </button>
          {'usb' in navigator && (
            <button
              type="button"
              onClick={() => runScan(true)}
              disabled={scanning || pairing}
              className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              {pairing
                ? dictValue('pairing', 'Pairing…')
                : dictValue('pairUsbPrinter', 'Pair USB printer')}
            </button>
          )}
        </div>
      </div>

      {scanned && detected.length === 0 && (
        <p className="text-sm text-gray-400 italic mb-3">
          {dictValue(
            'noPrintersFound',
            'No printers found. Try Pair USB printer, or use Browser Print / Network printer.'
          )}
        </p>
      )}

      {detected.length > 0 && (
        <div className="space-y-2 mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {dictValue('detectedDevices', 'Detected devices')}
          </p>
          {detected.map((device) => {
            const ids = formatVidPid(device.vendorId, device.productId);
            return (
              <div
                key={device.id}
                className="flex flex-wrap items-center justify-between gap-2 border border-gray-300 bg-white p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{device.label}</p>
                  <p className="text-xs text-gray-500">
                    {device.connection.toUpperCase()}
                    {ids ? <span className="font-mono">{` · ${ids}`}</span> : ''}
                    {device.matchedProfileName ? ` · ${device.matchedProfileName}` : ''}
                  </p>
                  {device.probeMessage && (
                    <p className="text-xs text-gray-500 mt-0.5">{device.probeMessage}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(device.probeStatus)}`}
                  >
                    {statusLabel(device.probeStatus, dictValue)}
                  </span>
                  {device.probeStatus !== 'unsupported' && (
                    <button
                      type="button"
                      onClick={() => applyDevice(device)}
                      className="inline-flex items-center justify-center px-3 py-2 text-xs font-semibold text-brand hover:underline"
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
        <div className="bg-brand-soft border border-brand p-4 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-brand-navy">{recommendation.summary}</p>
          <button
            type="button"
            onClick={applyRecommendation}
            className="inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors"
          >
            {dictValue('useRecommendedSetup', 'Use recommended setup')}
          </button>
        </div>
      )}
    </div>
  );
}
