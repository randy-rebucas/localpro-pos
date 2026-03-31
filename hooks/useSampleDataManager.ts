import { useCallback, useRef, useState } from 'react';

export interface PreviewData {
  businessType: string;
  preview: { categories: number; products: number; customers: number; discounts: number };
  existing: { categories: number; products: number; customers: number; discounts: number };
  sample: {
    categories: string[];
    products: { name: string; price: number; type: string }[];
    discounts: { code: string; name: string; value: number; type: string }[];
  };
}

export const useSampleDataManager = (tenant: string) => {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [installResults, setInstallResults] = useState<
    PreviewData['preview'] & { skipped?: PreviewData['preview'] }
  | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadPreview = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    abortControllerRef.current = controller;

    try {
      setPreviewLoading(true);
      const res = await fetch(`/api/tenants/${tenant}/seed-sample-data`, {
        credentials: 'include',
        signal: controller.signal,
      });
      const data = await res.json();
      if (data.success) {
        setPreview(data.data);
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Error loading preview:', error);
      }
    } finally {
      clearTimeout(timeoutId);
      setPreviewLoading(false);
    }
  }, [tenant]);

  const installSampleData = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (installing) return { success: false, error: 'Installation already in progress' };
    
    setInstalling(true);
    setMessage(null);
    setInstallResults(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const res = await fetch(`/api/tenants/${tenant}/seed-sample-data`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skipExisting: true }),
        signal: controller.signal,
      });
      const data = await res.json();

      if (data.success) {
        const r = data.data.results;
        const results = {
          categories: r.categories.created,
          products: r.products.created,
          customers: r.customers.created,
          discounts: r.discounts.created,
        };
        setInstallResults(results);
        setMessage({
          type: 'success',
          text: `Sample data installed successfully! ${
            results.categories + results.products + results.customers + results.discounts
          } records added.`,
        });

        // Refresh preview counts
        await loadPreview();
        return { success: true };
      } else {
        const errorMsg = data.error || 'Failed to install sample data.';
        setMessage({ type: 'error', text: errorMsg });
        return { success: false, error: errorMsg };
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        const errorMsg = 'An unexpected error occurred.';
        setMessage({ type: 'error', text: errorMsg });
        return { success: false, error: errorMsg };
      }
      return { success: false, error: 'Request timeout' };
    } finally {
      clearTimeout(timeoutId);
      setInstalling(false);
    }
  }, [tenant, installing, loadPreview]);

  const updateMessage = useCallback((msg: { type: 'success' | 'error'; text: string } | null) => {
    setMessage(msg);
  }, []);

  return {
    preview,
    previewLoading,
    installing,
    message,
    installResults,
    loadPreview,
    installSampleData,
    updateMessage,
  };
};
