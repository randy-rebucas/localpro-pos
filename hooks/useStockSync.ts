'use client';

import { useEffect, useRef, useState } from 'react';

interface StockUpdatePayload {
  productId: string;
  newStock: number;
}

interface UseStockSyncProps {
  tenant: string;
  branchId?: string;
  isOnline: boolean;
  onStockUpdate: (update: StockUpdatePayload) => void;
}

interface UseStockSyncReturn {
  connected: boolean;
}

export function useStockSync({
  tenant,
  branchId,
  isOnline,
  onStockUpdate,
}: UseStockSyncProps): UseStockSyncReturn {
  const [connected, setConnected] = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);
  const onStockUpdateRef = useRef(onStockUpdate);
  useEffect(() => { onStockUpdateRef.current = onStockUpdate; }, [onStockUpdate]);

  const MAX_RECONNECT_DELAY_MS = 60000;

  useEffect(() => {
    if (!tenant || !isOnline) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConnected(false);
      return;
    }

    let url = `/api/inventory/realtime?tenant=${tenant}`;
    if (branchId) url += `&branchId=${branchId}`;

    const eventSource = new EventSource(url);
    let reconnectTimeoutId: ReturnType<typeof setTimeout> | undefined;

    eventSource.onopen = () => {
      setConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);

        if (data.type === 'connected') {
          setConnected(true);
        } else if (data.type === 'stock_update') {
          if (data.productId != null && data.newStock != null) {
            onStockUpdateRef.current({
              productId: String(data.productId),
              newStock: data.newStock as number,
            });
          }
        } else if (data.type === 'error') {
          setConnected(false);
        }
      } catch {
        // ignore malformed messages
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
      eventSource.close();
      // Exponential backoff (capped) instead of a fixed 5s retry forever,
      // so a persistently failing connection doesn't hammer the server.
      const delay = Math.min(5000 * 2 ** reconnectCount, MAX_RECONNECT_DELAY_MS);
      reconnectTimeoutId = setTimeout(() => setReconnectCount((c) => c + 1), delay);
    };

    return () => {
      eventSource.close();
      setConnected(false);
      if (reconnectTimeoutId) clearTimeout(reconnectTimeoutId);
    };
  }, [tenant, branchId, isOnline, reconnectCount]);

  return { connected };
}
