'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';

interface StockUpdate {
  type: string;
  productId?: string;
  branchId?: string;
  variation?: {
    size?: string;
    color?: string;
    type?: string;
  };
  movementType?: string;
  quantity?: number;
  newStock?: number;
  previousStock?: number;
  timestamp?: string;
  message?: string;
}

interface RealTimeStockTrackerProps {
  productId?: string;
  branchId?: string;
  onStockUpdate?: (update: StockUpdate) => void;
  showIndicator?: boolean;
}

export default function RealTimeStockTracker({
  productId,
  branchId,
  onStockUpdate,
  showIndicator = true,
}: RealTimeStockTrackerProps) {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = (params?.lang as 'en' | 'es') || 'en';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  // Keep a stable ref to the callback so it never needs to be in the deps array
  const onStockUpdateRef = useRef(onStockUpdate);
  useEffect(() => { onStockUpdateRef.current = onStockUpdate; }, [onStockUpdate]);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    if (!tenant) return;

    // Build SSE URL
    let url = `/api/inventory/realtime?tenant=${tenant}`;
    if (productId) url += `&productId=${productId}`;
    if (branchId) url += `&branchId=${branchId}`;

    // Create EventSource connection
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data: StockUpdate = JSON.parse(event.data);

        if (data.type === 'connected') {
          setConnected(true);
        } else if (data.type === 'stock_update') {
          setLastUpdate(new Date());
          onStockUpdateRef.current?.(data);
        } else if (data.type === 'heartbeat') {
          // Keep connection alive
        } else if (data.type === 'error') {
          console.error('SSE Error:', data.message);
          setConnected(false);
        }
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
      eventSource.close();
      eventSourceRef.current = null;
      // Trigger a new EventSource by incrementing the reconnect counter
      setTimeout(() => setReconnectCount((c) => c + 1), 5000);
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [tenant, productId, branchId, reconnectCount]);

  if (!showIndicator) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <div
        className={`w-2 h-2 border border-gray-300 ${
          connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
        }`}
        title={connected ? (dict?.components?.realtimeStockTracker?.connected || 'Connected') : (dict?.components?.realtimeStockTracker?.disconnected || 'Disconnected')}
      />
      <span className="text-gray-500">
        {connected ? (dict?.components?.realtimeStockTracker?.live || 'Live') : (dict?.components?.realtimeStockTracker?.offline || 'Offline')}
      </span>
      {lastUpdate && (
        <span className="text-gray-400">
          • {(dict?.components?.realtimeStockTracker?.updated || 'Updated {time}').replace('{time}', lastUpdate.toLocaleTimeString())}
        </span>
      )}
    </div>
  );
}

