'use client';

import { useEffect, useRef, useState } from 'react'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { hardwareService } from '@/lib/hardware';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  enabled?: boolean;
}

export default function BarcodeScanner({ onScan, enabled = true }: BarcodeScannerProps) {
  const [isActive, setIsActive] = useState(enabled); // eslint-disable-line @typescript-eslint/no-unused-vars

  useEffect(() => {
    if (!isActive) return;

    const unsubscribe = hardwareService.onBarcodeScan((barcode) => {
      onScan(barcode);
    });

    return unsubscribe;
  }, [isActive, onScan]);

  return null; // This component doesn't render anything visible
}

