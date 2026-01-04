'use client';

import { useEffect, useState } from 'react';
import { hardwareService } from '@/lib/hardware';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  enabled?: boolean;
}

export default function BarcodeScanner({ onScan, enabled = true }: BarcodeScannerProps) {
  const [isActive] = useState(enabled);

  useEffect(() => {
    if (!isActive) return;

    const unsubscribe = hardwareService.onBarcodeScan((barcode) => {
      onScan(barcode);
    });

    return unsubscribe;
  }, [isActive, onScan]);

  return null; // This component doesn't render anything visible
}

