/**
 * Kitchen Display System (KDS) Utilities
 * Helper functions for status transitions, formatting, and UI helpers
 * (pattern-matched to lib/delivery-helpers.ts)
 */

export const KITCHEN_ITEM_STATUSES = [
  { value: 'queued', label: 'Queued' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'ready', label: 'Ready' },
  { value: 'served', label: 'Served' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export type KitchenItemStatus = typeof KITCHEN_ITEM_STATUSES[number]['value'];

/**
 * Get CSS classes for status badge
 */
export function getStatusColor(status: KitchenItemStatus): string {
  switch (status) {
    case 'queued':
      return 'bg-yellow-100 text-yellow-800';
    case 'preparing':
      return 'bg-blue-100 text-blue-800';
    case 'ready':
      return 'bg-green-100 text-green-800';
    case 'served':
      return 'bg-gray-100 text-gray-800';
    case 'cancelled':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

type Dict = Record<string, Record<string, string | undefined> | undefined>;

export function getStatusLabel(status: KitchenItemStatus, dict?: Dict): string {
  const labels: Record<KitchenItemStatus, string> = {
    queued: dict?.admin?.queued || 'Queued',
    preparing: dict?.admin?.preparing || 'Preparing',
    ready: dict?.admin?.ready || 'Ready',
    served: dict?.admin?.served || 'Served',
    cancelled: dict?.admin?.cancelled || 'Cancelled',
  };
  return labels[status] || status;
}

/**
 * Allowed kitchen ticket item status transitions.
 * Pipeline: queued -> preparing -> ready -> served.
 * cancelled is a terminal escape reachable from any non-terminal
 * (i.e. not already served/cancelled) state. served/cancelled are
 * themselves terminal — no further transitions.
 */
const ALLOWED_KITCHEN_ITEM_STATUS_TRANSITIONS: Record<KitchenItemStatus, KitchenItemStatus[]> = {
  queued: ['queued', 'preparing', 'cancelled'],
  preparing: ['preparing', 'ready', 'cancelled'],
  ready: ['ready', 'served', 'cancelled'],
  served: ['served'],
  cancelled: ['cancelled'],
};

export function isValidKitchenItemStatusTransition(from: KitchenItemStatus, to: KitchenItemStatus): boolean {
  return ALLOWED_KITCHEN_ITEM_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Statuses selectable from the current one (includes the current status itself).
 */
export function getAllowedNextStatuses(from: KitchenItemStatus): KitchenItemStatus[] {
  return ALLOWED_KITCHEN_ITEM_STATUS_TRANSITIONS[from] ?? [from];
}

/**
 * A terminal status (served/cancelled) has no further transitions.
 */
export function isKitchenItemStatusEditable(status: KitchenItemStatus): boolean {
  return getAllowedNextStatuses(status).length > 1;
}
