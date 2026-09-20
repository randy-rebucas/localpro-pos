/**
 * Laundry Order Utilities
 * Helper functions for status formatting, date formatting, and UI helpers
 * (pattern-matched to lib/work-order-helpers.ts)
 */

export const LAUNDRY_ORDER_STATUSES = [
  { value: 'booked', label: 'Booked' },
  { value: 'picked_up', label: 'Picked Up' },
  { value: 'received', label: 'Received' },
  { value: 'sorting', label: 'Sorting' },
  { value: 'washing', label: 'Washing' },
  { value: 'drying', label: 'Drying' },
  { value: 'folding', label: 'Folding' },
  { value: 'ready', label: 'Ready' },
  { value: 'out_for_delivery', label: 'Out for Delivery' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export type LaundryOrderStatus = typeof LAUNDRY_ORDER_STATUSES[number]['value'];

/**
 * Get CSS classes for status badge
 */
export function getLaundryStatusColor(status: LaundryOrderStatus): string {
  switch (status) {
    case 'booked':
      return 'bg-yellow-100 text-yellow-800';
    case 'picked_up':
      return 'bg-blue-100 text-blue-800';
    case 'received':
      return 'bg-indigo-100 text-indigo-800';
    case 'sorting':
    case 'washing':
    case 'drying':
    case 'folding':
      return 'bg-purple-100 text-purple-800';
    case 'ready':
      return 'bg-teal-100 text-teal-800';
    case 'out_for_delivery':
      return 'bg-orange-100 text-orange-800';
    case 'completed':
      return 'bg-green-100 text-green-800';
    case 'cancelled':
      return 'bg-gray-100 text-gray-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

type Dict = Record<string, Record<string, string | undefined> | undefined>;

export function getLaundryStatusLabel(status: LaundryOrderStatus, dict?: Dict): string {
  const labels: Record<LaundryOrderStatus, string> = {
    booked: dict?.admin?.booked || 'Booked',
    picked_up: dict?.admin?.pickedUp || 'Picked Up',
    received: dict?.admin?.received || 'Received',
    sorting: dict?.admin?.sorting || 'Sorting',
    washing: dict?.admin?.washing || 'Washing',
    drying: dict?.admin?.drying || 'Drying',
    folding: dict?.admin?.folding || 'Folding',
    ready: dict?.admin?.ready || 'Ready',
    out_for_delivery: dict?.admin?.outForDelivery || 'Out for Delivery',
    completed: dict?.admin?.completed || 'Completed',
    cancelled: dict?.admin?.cancelled || 'Cancelled',
  };
  return labels[status] || status;
}

/**
 * Format date and time for display
 */
export function formatLaundryOrderDateTime(dateString: string | Date): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Allowed laundry order status transitions.
 * Pipeline: booked -> picked_up -> received -> sorting -> washing -> drying
 * -> folding -> ready -> out_for_delivery -> completed.
 * ready can also go straight to completed (walk-in pickup, no delivery leg).
 * cancelled is a terminal escape reachable from any non-terminal
 * (i.e. not already completed/cancelled) state. completed/cancelled
 * are themselves terminal — no further transitions.
 */
const ALLOWED_LAUNDRY_STATUS_TRANSITIONS: Record<LaundryOrderStatus, LaundryOrderStatus[]> = {
  booked: ['booked', 'picked_up', 'received', 'cancelled'],
  picked_up: ['picked_up', 'received', 'cancelled'],
  received: ['received', 'sorting', 'cancelled'],
  sorting: ['sorting', 'washing', 'cancelled'],
  washing: ['washing', 'drying', 'cancelled'],
  drying: ['drying', 'folding', 'cancelled'],
  folding: ['folding', 'ready', 'cancelled'],
  ready: ['ready', 'out_for_delivery', 'completed', 'cancelled'],
  out_for_delivery: ['out_for_delivery', 'completed', 'cancelled'],
  completed: ['completed'],
  cancelled: ['cancelled'],
};

export function isValidLaundryStatusTransition(from: LaundryOrderStatus, to: LaundryOrderStatus): boolean {
  return ALLOWED_LAUNDRY_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Statuses selectable from the current one (includes the current status itself).
 */
export function getAllowedNextLaundryStatuses(from: LaundryOrderStatus): LaundryOrderStatus[] {
  return ALLOWED_LAUNDRY_STATUS_TRANSITIONS[from] ?? [from];
}

/**
 * A terminal status (completed/cancelled) has no further transitions.
 */
export function isLaundryStatusEditable(status: LaundryOrderStatus): boolean {
  return getAllowedNextLaundryStatuses(status).length > 1;
}

/**
 * Maps a laundry order status to the timestamp field on LaundryOrder that
 * should be stamped when transitioning into it (mirrors WorkOrder's
 * per-status timestamp convention).
 */
export const LAUNDRY_STATUS_TIMESTAMP_FIELD: Partial<Record<LaundryOrderStatus, string>> = {
  received: 'receivedAt',
  sorting: 'sortedAt',
  washing: 'washedAt',
  drying: 'driedAt',
  folding: 'foldedAt',
  ready: 'readyAt',
  completed: 'completedAt',
  cancelled: 'cancelledAt',
};

export function getCancelLaundryOrderConfirmMessage(dict?: Dict): string {
  return dict?.common?.cancelLaundryOrderConfirm || 'Are you sure you want to cancel this laundry order?';
}
