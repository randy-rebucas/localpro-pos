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
  // The stream polls the database server-side while open — close it while the
  // tab is in the background and reconnect when it becomes visible again.
  const [visible, setVisible] = useState(
    typeof document === 'undefined' ? true : !document.hidden
  );
  useEffect(() => {
    const onVisibilityChange = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);
  const onStockUpdateRef = useRef(onStockUpdate);
  // Timestamp of the last update received — sent on reconnect so the server
  // replays what was missed while the stream was closed
  const lastEventAtRef = useRef<string | null>(null);
  useEffect(() => { onStockUpdateRef.current = onStockUpdate; }, [onStockUpdate]);

  const MAX_RECONNECT_DELAY_MS = 60000;

  useEffect(() => {
    if (!tenant || !isOnline || !visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConnected(false);
      return;
    }

    let url = `/api/inventory/realtime?tenant=${tenant}`;
    if (branchId) url += `&branchId=${branchId}`;
    if (lastEventAtRef.current) url += `&since=${encodeURIComponent(lastEventAtRef.current)}`;

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
          if (data.timestamp) lastEventAtRef.current = String(data.timestamp);
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
      // Resume from "now" if no update arrived while connected
      if (!lastEventAtRef.current) lastEventAtRef.current = new Date().toISOString();
      eventSource.close();
      setConnected(false);
      if (reconnectTimeoutId) clearTimeout(reconnectTimeoutId);
    };
  }, [tenant, branchId, isOnline, visible, reconnectCount]);

  return { connected };
}
