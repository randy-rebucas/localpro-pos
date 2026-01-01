'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';

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
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

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
          onStockUpdate?.(data);
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

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      setConnected(false);
      
      // Attempt to reconnect after 5 seconds
      setTimeout(() => {
        if (eventSourceRef.current?.readyState === EventSource.CLOSED) {
          eventSource.close();
          // Reconnect will happen via useEffect
        }
      }, 5000);
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [tenant, productId, branchId, onStockUpdate]);

  if (!showIndicator) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <div
        className={`w-2 h-2 border border-gray-300 ${
          connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
        }`}
        title={connected ? 'Connected' : 'Disconnected'}
      />
      <span className="text-gray-500">
        {connected ? 'Live' : 'Offline'}
      </span>
      {lastUpdate && (
        <span className="text-gray-400">
          • Updated {lastUpdate.toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}

