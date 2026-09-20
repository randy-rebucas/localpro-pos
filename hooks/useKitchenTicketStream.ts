'use client';

import { useEffect, useRef, useState } from 'react';
import type { KitchenItemStatus } from '@/lib/kitchen-display-helpers';

interface KitchenItemUpdatePayload {
  kitchenTicketId: string;
  itemId: string;
  status: KitchenItemStatus;
  station: string | null;
  startedAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  transactionItem: { id: string; name: string; quantity: number; price: number } | null;
  timestamp: string;
}

interface UseKitchenTicketStreamProps {
  tenant: string;
  branchId?: string;
  isOnline: boolean;
  onItemUpdate: (update: KitchenItemUpdatePayload) => void;
}

interface UseKitchenTicketStreamReturn {
  connected: boolean;
}

/**
 * EventSource connection/reconnect/backoff pattern mirroring hooks/useStockSync.ts,
 * subscribing to /api/kitchen-tickets/stream for live Kitchen Display updates.
 */
export function useKitchenTicketStream({
  tenant,
  branchId,
  isOnline,
  onItemUpdate,
}: UseKitchenTicketStreamProps): UseKitchenTicketStreamReturn {
  const [connected, setConnected] = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);
  const onItemUpdateRef = useRef(onItemUpdate);
  useEffect(() => { onItemUpdateRef.current = onItemUpdate; }, [onItemUpdate]);

  const MAX_RECONNECT_DELAY_MS = 60000;

  useEffect(() => {
    if (!tenant || !isOnline) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConnected(false);
      return;
    }

    let url = `/api/kitchen-tickets/stream?tenant=${tenant}`;
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
        } else if (data.type === 'kitchen_item_update') {
          if (data.itemId != null && data.kitchenTicketId != null) {
            onItemUpdateRef.current(data as KitchenItemUpdatePayload);
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
