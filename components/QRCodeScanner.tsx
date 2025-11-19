'use client';

import { useEffect, useRef, useState } from 'react';
import { hardwareService } from '@/lib/hardware';

interface QRCodeScannerProps {
  onScan: (data: string) => void;
  onClose?: () => void;
  enabled?: boolean;
}

export default function QRCodeScanner({ onScan, onClose, enabled = true }: QRCodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !videoRef.current) return;

    const startScan = async () => {
      try {
        setIsScanning(true);
        setError(null);
        await hardwareService.startQRScanning(videoRef.current!, onScan);
      } catch (err: any) {
        setError(err.message || 'Failed to start QR scanner');
        setIsScanning(false);
      }
    };

    startScan();

    return () => {
      hardwareService.stopQRScanning();
      setIsScanning(false);
    };
  }, [enabled, onScan]);

  if (!enabled) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Scan QR Code</h2>
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
              className="w-full rounded-lg"
              autoPlay
              playsInline
              muted
            />
            <div className="absolute inset-0 border-4 border-blue-500 rounded-lg pointer-events-none">
              <div className="absolute top-2 left-2 w-8 h-8 border-t-4 border-l-4 border-blue-500"></div>
              <div className="absolute top-2 right-2 w-8 h-8 border-t-4 border-r-4 border-blue-500"></div>
              <div className="absolute bottom-2 left-2 w-8 h-8 border-b-4 border-l-4 border-blue-500"></div>
              <div className="absolute bottom-2 right-2 w-8 h-8 border-b-4 border-r-4 border-blue-500"></div>
            </div>
          </div>
        )}

        <p className="text-sm text-gray-600 mt-4 text-center">
          Position the QR code within the frame
        </p>
      </div>
    </div>
  );
}

