/**
 * Delivery / Rider Management Utilities
 * Helper functions for status formatting, date formatting, and UI helpers
 * (pattern-matched to lib/bookings-helpers.ts)
 */

export const DELIVERY_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'picked_up', label: 'Picked Up' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export type DeliveryStatus = typeof DELIVERY_STATUSES[number]['value'];
export type DeliveryType = 'pickup' | 'delivery';

/**
 * Get CSS classes for status badge
 */
export function getStatusColor(status: DeliveryStatus): string {
  switch (status) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800';
    case 'assigned':
      return 'bg-blue-100 text-blue-800';
    case 'picked_up':
      return 'bg-indigo-100 text-indigo-800';
    case 'in_transit':
      return 'bg-purple-100 text-purple-800';
    case 'delivered':
      return 'bg-green-100 text-green-800';
    case 'failed':
      return 'bg-red-100 text-red-800';
    case 'cancelled':
      return 'bg-gray-100 text-gray-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

type Dict = Record<string, Record<string, string | undefined> | undefined>;

export function getStatusLabel(status: DeliveryStatus, dict?: Dict): string {
  const labels: Record<DeliveryStatus, string> = {
    pending: dict?.admin?.pending || 'Pending',
    assigned: dict?.admin?.assigned || 'Assigned',
    picked_up: dict?.admin?.pickedUp || 'Picked Up',
    in_transit: dict?.admin?.inTransit || 'In Transit',
    delivered: dict?.admin?.delivered || 'Delivered',
    failed: dict?.admin?.failed || 'Failed',
    cancelled: dict?.admin?.cancelled || 'Cancelled',
  };
  return labels[status] || status;
}

/**
 * Format date and time for display
 */
export function formatDeliveryDateTime(dateString: string | Date): string {
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
 * Allowed delivery status transitions.
 * Pipeline: pending -> assigned -> picked_up -> in_transit -> delivered.
 * failed/cancelled are terminal escapes reachable from any non-terminal
 * (i.e. not already delivered/failed/cancelled) state. delivered/failed/
 * cancelled are themselves terminal — no further transitions.
 */
const ALLOWED_DELIVERY_STATUS_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  pending: ['pending', 'assigned', 'failed', 'cancelled'],
  assigned: ['assigned', 'picked_up', 'failed', 'cancelled'],
  picked_up: ['picked_up', 'in_transit', 'failed', 'cancelled'],
  in_transit: ['in_transit', 'delivered', 'failed', 'cancelled'],
  delivered: ['delivered'],
  failed: ['failed'],
  cancelled: ['cancelled'],
};

export function isValidDeliveryStatusTransition(from: DeliveryStatus, to: DeliveryStatus): boolean {
  return ALLOWED_DELIVERY_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Statuses selectable from the current one (includes the current status itself).
 */
export function getAllowedNextStatuses(from: DeliveryStatus): DeliveryStatus[] {
  return ALLOWED_DELIVERY_STATUS_TRANSITIONS[from] ?? [from];
}

/**
 * A terminal status (delivered/failed/cancelled) has no further transitions.
 */
export function isDeliveryStatusEditable(status: DeliveryStatus): boolean {
  return getAllowedNextStatuses(status).length > 1;
}

export function getDeleteDeliveryConfirmMessage(dict?: Dict): string {
  return dict?.common?.cancelDeliveryConfirm || 'Are you sure you want to cancel this delivery order?';
}
