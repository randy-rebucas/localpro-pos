import { useCallback, useRef, useEffect } from 'react';

/**
 * Hook for managing fetch operations with abort controller and timeout
 */
export function useFetchWithAbort() {
  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async <T,>(
    url: string,
    options: {
      onSuccess: (data: T) => void;
      onError: (error: string) => void;
      method?: string;
      body?: unknown;
      timeoutMs?: number;
    }
  ) => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    const timeoutMs = options.timeoutMs || 30000;

    return new Promise<void>((resolve) => {
      timeoutRef.current = setTimeout(() => {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        options.onError('Request timeout');
        resolve();
      }, timeoutMs);

      (async () => {
        try {
          const fetchOptions: RequestInit = {
            signal: abortControllerRef.current!.signal,
            credentials: 'include',
          };

          if (options.method) fetchOptions.method = options.method;
          if (options.body) {
            fetchOptions.headers = {
              'Content-Type': 'application/json',
            };
            fetchOptions.body = JSON.stringify(options.body);
          }

          const response = await fetch(url, fetchOptions);

          if (!response.ok) {
            const errorData = await response.json();
            options.onError(errorData.error || `HTTP ${response.status}`);
          } else {
            const data = await response.json();
            options.onSuccess(data.data || data);
          }
        } catch (err) {
          if (err instanceof Error && err.name !== 'AbortError') {
            options.onError(err.message || 'Failed to fetch');
          }
        } finally {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          resolve();
        }
      })();
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { fetchData };
}
