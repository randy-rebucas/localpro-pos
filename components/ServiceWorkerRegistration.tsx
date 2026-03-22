'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { syncService } from '@/lib/sync-service';

export default function ServiceWorkerRegistration() {
  const params = useParams();
  const tenant = params?.tenant as string;

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch((error) => {
        console.error('Service worker registration failed:', error);
      });

    // Listen for background sync messages from the service worker
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_TRANSACTIONS' && tenant) {
        syncService.sync(tenant);
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, [tenant]);

  return null;
}
