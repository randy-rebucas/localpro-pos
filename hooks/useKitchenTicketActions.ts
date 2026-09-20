import { useCallback } from 'react';
import type { KitchenItemStatus } from '@/lib/kitchen-display-helpers';

/**
 * PATCH wrapper for kitchen ticket item status/station updates.
 * Mirrors the mutation style in hooks/useDeliveryList.ts (AbortController timeouts,
 * credentials: 'include').
 */
export function useKitchenTicketActions(tenant: string) {
  const updateItemStatus = useCallback(
    async (
      ticketId: string,
      itemId: string,
      status: KitchenItemStatus,
      onSuccess?: () => void,
      onError?: (error: string) => void
    ) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const res = await globalThis.fetch(`/api/kitchen-tickets/${ticketId}/items/${itemId}?tenant=${tenant}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ status }),
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          onSuccess?.();
        } else {
          const errorMsg = data.error || 'Failed to update kitchen ticket item';
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to update kitchen ticket item';
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
      }
    },
    [tenant]
  );

  const assignStation = useCallback(
    async (
      ticketId: string,
      itemId: string,
      station: string,
      onSuccess?: () => void,
      onError?: (error: string) => void
    ) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const res = await globalThis.fetch(`/api/kitchen-tickets/${ticketId}/items/${itemId}?tenant=${tenant}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ station }),
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          onSuccess?.();
        } else {
          const errorMsg = data.error || 'Failed to assign station';
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to assign station';
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
      }
    },
    [tenant]
  );

  return { updateItemStatus, assignStation };
}
