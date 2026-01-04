'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { hardwareService } from '@/lib/hardware';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';

interface QRCodeScannerProps {
  onScan: (data: string) => void;
  onClose?: () => void;
  enabled?: boolean;
}

export default function QRCodeScanner({ onScan, onClose, enabled = true }: QRCodeScannerProps) {
  const params = useParams();
  const lang = (params?.lang as 'en' | 'es') || 'en';
  const [dict, setDict] = useState<Record<string, unknown> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_isScanning, _setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    if (!enabled || !videoRef.current) return;

    const startScan = async () => {
      try {
        setIsScanning(true);
        setError(null);
        await hardwareService.startQRScanning(videoRef.current!, onScan);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : (dict?.common?.failedToStartQRScanner as string) || 'Failed to start QR scanner');
        setIsScanning(false);
      }
    };

    startScan();

    return () => {
      hardwareService.stopQRScanning();
      setIsScanning(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, onScan]); // dict is stable, onScan callback is stable

  if (!enabled) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white border border-gray-300 p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">{dict?.common?.scanQRCode || dict?.login?.scanQRCode || 'Scan QR Code'}</h2>
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

        {error ? (
          <div className="text-red-600 mb-4">{error}</div>
        ) : (
          <div className="relative">
            <video
              ref={videoRef}
              className="w-full border border-gray-300"
              autoPlay
              playsInline
              muted
            />
            <div className="absolute inset-0 border-4 border-blue-500 pointer-events-none">
              <div className="absolute top-2 left-2 w-8 h-8 border-t-4 border-l-4 border-blue-500"></div>
              <div className="absolute top-2 right-2 w-8 h-8 border-t-4 border-r-4 border-blue-500"></div>
              <div className="absolute bottom-2 left-2 w-8 h-8 border-b-4 border-l-4 border-blue-500"></div>
              <div className="absolute bottom-2 right-2 w-8 h-8 border-b-4 border-r-4 border-blue-500"></div>
            </div>
          </div>
        )}

        <p className="text-sm text-gray-600 mt-4 text-center">
          {dict?.common?.positionQRCode || 'Position the QR code within the frame'}
        </p>
      </div>
    </div>
  );
}

