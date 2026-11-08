'use client';

import { useEffect, useState } from 'react';
import { Search, Usb } from 'lucide-react';
import {
  hardwareService,
  printerConfigFromDetected,
  type DetectedPrinter,
  type PrinterSetupRecommendation,
} from '@/lib/hardware';
import { showToast } from '@/lib/toast';
import { hardwareStatusChecker } from '@/lib/hardware/status-checker';
import { KEY, KEY_PRIMARY } from '@/components/admin/register-ui';

interface PrinterDetectionPanelProps {
  dictValue: (key: string, fallback: string) => string;
  onApplyPrinter: (printer: PrinterSetupRecommendation['printer']) => void;
  disabled?: boolean;
}

function formatVidPid(vendorId?: number, productId?: number): string | null {
  if (vendorId === undefined) return null;
  const vid = `0x${vendorId.toString(16).padStart(4, '0').toUpperCase()}`;
  if (productId === undefined) return vid;
  const pid = `0x${productId.toString(16).padStart(4, '0').toUpperCase()}`;
  return `${vid}:${pid}`;
}

/** The tag beside each detected printer: teal when it can print directly, red when it cannot. */
function statusTagClass(status: DetectedPrinter['probeStatus']): string {
  switch (status) {
    case 'ready':
      return 'bg-brand text-ink';
    case 'os_driver_claimed':
    case 'error':
      return 'bg-stamp text-paper-white';
    default:
      return 'bg-ink/10 text-ink/70';
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

/** Finds printers this browser can reach and offers the setup that suits them. */
export default function PrinterDetectionPanel({ dictValue, onApplyPrinter, disabled = false }: PrinterDetectionPanelProps) {
  const [scanning, setScanning] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [detected, setDetected] = useState<DetectedPrinter[]>([]);
  const [recommendation, setRecommendation] = useState<PrinterSetupRecommendation | null>(null);
  const [scanned, setScanned] = useState(false);
  // Read after mount so the server render and the first client render agree.
  const [usbSupported, setUsbSupported] = useState(false);
  useEffect(() => setUsbSupported('usb' in navigator), []);

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

  const busy = disabled || scanning || pairing;

  return (
    <div className="border border-dashed border-ink/30 bg-paper p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <h4 className="font-receipt text-xs font-semibold uppercase tracking-[0.08em]">{dictValue('detectDevices', 'Detect Devices')}</h4>
          <p className="mt-1 text-sm text-ink/70">
            {dictValue('detectDevicesHint', 'Scan paired printers or pair a new USB device, then apply the recommended setup.')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => runScan(false)} disabled={busy} className={KEY_PRIMARY}>
            <Search className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {scanning ? dictValue('scanning', 'Scanning...') : dictValue('scanForPrinters', 'Scan for printers')}
          </button>
          {usbSupported && (
            <button type="button" onClick={() => runScan(true)} disabled={busy} className={`${KEY} bg-paper-white`}>
              <Usb className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              {pairing ? dictValue('pairing', 'Pairing...') : dictValue('pairUsbPrinter', 'Pair USB printer')}
            </button>
          )}
        </div>
      </div>

      {scanned && detected.length === 0 && (
        <p className="mt-3 font-receipt text-xs text-ink/70">
          {dictValue('noPrintersFound', 'No printers found. Try Pair USB printer, or use Browser Print / Network printer.')}
        </p>
      )}

      {detected.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 font-receipt text-xs uppercase tracking-[0.08em] text-ink/60">{dictValue('detectedDevices', 'Detected devices')}</p>
          <ul className="divide-y divide-dashed divide-ink/20 border-y border-dashed border-ink/20 bg-paper-white">
            {detected.map((device) => {
              const ids = formatVidPid(device.vendorId, device.productId);
              return (
                <li key={device.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="truncate text-sm font-medium">{device.label}</p>
                    <p className="font-receipt text-xs text-ink/60">
                      {device.connection.toUpperCase()}
                      {ids ? ` · ${ids}` : ''}
                      {device.matchedProfileName ? ` · ${device.matchedProfileName}` : ''}
                    </p>
                    {device.probeMessage && <p className="mt-0.5 text-xs text-ink/60">{device.probeMessage}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`px-2 py-0.5 font-receipt text-[11px] uppercase ${statusTagClass(device.probeStatus)}`}>
                      {statusLabel(device.probeStatus, dictValue)}
                    </span>
                    {device.probeStatus !== 'unsupported' && (
                      <button type="button" disabled={disabled} onClick={() => applyDevice(device)} className={`${KEY} min-h-[36px] px-3`}>
                        {dictValue('useThisPrinter', 'Use this printer')}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {recommendation && (
        <div className="mt-4 border-l-4 border-brand-hover bg-paper-white px-3 py-3">
          <p className="text-sm">{recommendation.summary}</p>
          <button type="button" disabled={disabled} onClick={applyRecommendation} className={`${KEY_PRIMARY} mt-3`}>
            {dictValue('useRecommendedSetup', 'Use recommended setup')}
          </button>
        </div>
      )}
    </div>
  );
}
