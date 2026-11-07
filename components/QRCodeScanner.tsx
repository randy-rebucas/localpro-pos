'use client';

import '@/app/marketing.css';
import { marketingFontClasses } from '@/components/marketing/fonts';
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
    <div className={`${marketingFontClasses} fixed inset-0 bg-ink/70 flex items-center justify-center z-50`}>
      <div className="bg-paper-white text-ink p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-display text-3xl font-extrabold uppercase leading-none text-ink">{dict?.common?.scanQRCode || dict?.login?.scanQRCode || 'Scan QR Code'}</h2>
          {onClose && (
            <button
              onClick={onClose}
              className="text-ink/60 hover:text-ink"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="relative overflow-hidden bg-ink min-h-[240px]">
          <video
            ref={videoRef}
            className="w-full"
            autoPlay
            playsInline
            muted
          />

          {status === 'scanning' && (
            <div className="absolute inset-0 border-4 border-brand pointer-events-none">
              <span className="mk-sweep" />
              <div className="absolute top-2 left-2 w-8 h-8 border-t-4 border-l-4 border-brand"></div>
              <div className="absolute top-2 right-2 w-8 h-8 border-t-4 border-r-4 border-brand"></div>
              <div className="absolute bottom-2 left-2 w-8 h-8 border-b-4 border-l-4 border-brand"></div>
              <div className="absolute bottom-2 right-2 w-8 h-8 border-b-4 border-r-4 border-brand"></div>
            </div>
          )}

          {showOverlay && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink/80 px-6 text-center">
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
                      <svg className="w-10 h-10 text-paper-white mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l-4 4m0-4l4 4m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-paper-white text-sm mb-4">{error}</p>
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
                    className="px-4 py-2 bg-brand text-ink font-receipt text-xs font-medium uppercase hover:bg-brand-muted transition-colors"
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

        <p className="font-receipt text-xs text-ink/70 mt-4 text-center">
          {dict?.common?.positionQRCode || 'Position the QR code within the frame'}
        </p>
      </div>
    </div>
  );
}
