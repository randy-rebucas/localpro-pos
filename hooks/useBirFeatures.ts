import { useCallback, useState } from 'react';

export interface BirComplianceFeatures {
  ptuAssistance: boolean;
  receiptFormatting: boolean;
  birDocumentation: boolean;
  casReporting: boolean;
  auditTrailSystem: boolean;
  monthlySupport: boolean;
}

export function useBirFeatures() {
  const [birFeatures, setBirFeatures] = useState<BirComplianceFeatures | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFeatures = useCallback(async (onError?: (error: string) => void) => {
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await globalThis.fetch('/api/subscription/status', {
        credentials: 'include',
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorMsg = 'Failed to fetch BIR features';
        setError(errorMsg);
        onError?.(errorMsg);
        return;
      }

      const data = await res.json();

      if (data.success && data.data?.birCompliance) {
        setBirFeatures(data.data.birCompliance);
      } else if (data.success && data.data) {
        // Fallback: no birCompliance in status means all locked except auditTrailSystem
        setBirFeatures({
          ptuAssistance: false,
          receiptFormatting: false,
          birDocumentation: false,
          casReporting: false,
          auditTrailSystem: true,
          monthlySupport: false,
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch BIR features';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, []);

  return { birFeatures, loading, error, fetchFeatures };
}
