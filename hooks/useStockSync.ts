'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

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
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { onStockUpdateRef.current = onStockUpdate; }, [onStockUpdate]);

  const scheduleReconnect = useCallback(() => {
    setTimeout(() => setReconnectCount((c) => c + 1), 5000);
  }, []);

  useEffect(() => {
    if (!tenant || !isOnline) {
      setConnected(false);
      return;
    }

    let url = `/api/inventory/realtime?tenant=${tenant}`;
    if (branchId) url += `&branchId=${branchId}`;

    const eventSource = new EventSource(url);

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
      scheduleReconnect();
    };

    return () => {
      eventSource.close();
      setConnected(false);
    };
  // reconnectCount intentionally triggers re-subscription after disconnect
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, branchId, isOnline, reconnectCount, scheduleReconnect]);

  return { connected };
}
