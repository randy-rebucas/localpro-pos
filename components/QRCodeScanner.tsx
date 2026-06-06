'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { hardwareService } from '@/lib/hardware';
import { CameraAccessError } from '@/lib/hardware/qr-reader';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';

interface QRCodeScannerProps {
  onScan: (data: string) => void;
  onClose?: () => void;
  enabled?: boolean;
}

type ScannerStatus = 'prompt' | 'starting' | 'scanning' | 'error';

export default function QRCodeScanner({ onScan, onClose, enabled = true }: QRCodeScannerProps) {
  const params = useParams();
  const lang = (params?.lang as 'en' | 'es') || 'en';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<ScannerStatus>('prompt');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    if (!enabled) return;

    return () => {
      hardwareService.stopQRScanning();
    };
  }, [enabled]);

  const getErrorMessage = useCallback(
    (err: unknown) => {
      if (err instanceof CameraAccessError) {
        if (err.code === 'denied') {
          return dict?.common?.cameraPermissionDenied || err.message;
        }
        if (err.code === 'not_found') {
          return dict?.common?.cameraNotFound || err.message;
        }
        if (err.code === 'unsupported') {
          return dict?.common?.cameraNotSupported || err.message;
        }
      }

      const name = err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
      if (name === 'NotAllowedError') {
        return dict?.common?.cameraPermissionDenied || 'Camera access denied. Please allow camera permissions in your browser settings and try again.';
      }
      if (name === 'NotFoundError') {
        return dict?.common?.cameraNotFound || 'No camera found. Please connect a camera and try again.';
      }

      const message = err && typeof err === 'object' && 'message' in err ? String(err.message) : '';
      return message || dict?.common?.failedToStartQRScanner || 'Failed to start QR scanner';
    },
    [dict]
  );

  const startCamera = useCallback(async () => {
    if (!videoRef.current) return;

    setStatus('starting');
    setError(null);

    try {
      await hardwareService.startQRScanning(videoRef.current, onScan);
      setStatus('scanning');
    } catch (err) {
      setError(getErrorMessage(err));
      setStatus('error');
    }
  }, [getErrorMessage, onScan]);

  if (!enabled) return null;

  const showOverlay = status === 'prompt' || status === 'starting' || status === 'error';

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

        <div className="relative bg-gray-900 min-h-[240px]">
          <video
            ref={videoRef}
            className="w-full border border-gray-300"
            autoPlay
            playsInline
            muted
          />

          {status === 'scanning' && (
            <div className="absolute inset-0 border-4 border-brand pointer-events-none">
              <div className="absolute top-2 left-2 w-8 h-8 border-t-4 border-l-4 border-brand"></div>
              <div className="absolute top-2 right-2 w-8 h-8 border-t-4 border-r-4 border-brand"></div>
              <div className="absolute bottom-2 left-2 w-8 h-8 border-b-4 border-l-4 border-brand"></div>
              <div className="absolute bottom-2 right-2 w-8 h-8 border-b-4 border-r-4 border-brand"></div>
            </div>
          )}

          {showOverlay && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 px-6 text-center">
              {status === 'starting' ? (
                <>
                  <div className="animate-spin h-8 w-8 border-b-2 border-white mb-3" />
                  <p className="text-white text-sm">
                    {dict?.common?.startingCamera || 'Starting camera...'}
                  </p>
                </>
              ) : (
                <>
                  {status === 'error' && (
                    <>
                      <svg className="w-10 h-10 text-red-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l-4 4m0-4l4 4m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-red-200 text-sm mb-4">{error}</p>
                    </>
                  )}
                  {status === 'prompt' && (
                    <p className="text-white text-sm mb-4">
                      {dict?.common?.enableCameraPrompt || 'Click below to allow camera access for QR scanning.'}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={startCamera}
                    className="px-4 py-2 bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors"
                  >
                    {status === 'error'
                      ? (dict?.common?.retry || 'Try Again')
                      : (dict?.common?.enableCamera || 'Enable Camera')}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <p className="text-sm text-gray-600 mt-4 text-center">
          {dict?.common?.positionQRCode || 'Position the QR code within the frame'}
        </p>
      </div>
    </div>
  );
}
