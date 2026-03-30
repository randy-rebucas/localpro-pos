import { useCallback, useState } from 'react';

export interface QrData {
  qrToken: string;
  name: string;
  email: string;
}

export function useQrCode(userId: string) {
  const [qrData, setQrData] = useState<QrData | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState('');

  const fetchQRCode = useCallback(async (onError?: (error: string) => void) => {
    setLoading(true);
    setError('');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await globalThis.fetch(`/api/users/${userId}/qr-code`, {
        credentials: 'include',
        signal: controller.signal,
      });

      const data = await res.json();

      if (data.success) {
        setQrData(data.data);
      } else {
        const errorMsg = data.error || 'Failed to load QR code';
        setError(errorMsg);
        onError?.(errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load QR code';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [userId]);

  const regenerateQRCode = useCallback(async (onSuccess?: () => void, onError?: (error: string) => void) => {
    setRegenerating(true);
    setError('');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await globalThis.fetch(`/api/users/${userId}/qr-code`, {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
      });

      const data = await res.json();

      if (data.success) {
        setQrData((prevData) => prevData ? { ...prevData, qrToken: data.data.qrToken } : data.data);
        onSuccess?.();
      } else {
        const errorMsg = data.error || 'Failed to regenerate QR code';
        setError(errorMsg);
        onError?.(errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to regenerate QR code';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      clearTimeout(timeout);
      setRegenerating(false);
    }
  }, [userId]);

  return { qrData, loading, regenerating, error, fetchQRCode, regenerateQRCode };
}
