/**
 * Job / Work Order Utilities
 * Helper functions for status formatting, date formatting, and UI helpers
 * (pattern-matched to lib/delivery-helpers.ts)
 */

export const WORK_ORDER_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export type WorkOrderStatus = typeof WORK_ORDER_STATUSES[number]['value'];

/**
 * Get CSS classes for status badge
 */
export function getStatusColor(status: WorkOrderStatus): string {
  switch (status) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800';
    case 'assigned':
      return 'bg-blue-100 text-blue-800';
    case 'in_progress':
      return 'bg-purple-100 text-purple-800';
    case 'on_hold':
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

export function getStatusLabel(status: WorkOrderStatus, dict?: Dict): string {
  const labels: Record<WorkOrderStatus, string> = {
    pending: dict?.admin?.pending || 'Pending',
    assigned: dict?.admin?.assigned || 'Assigned',
    in_progress: dict?.admin?.inProgress || 'In Progress',
    on_hold: dict?.admin?.onHold || 'On Hold',
    completed: dict?.admin?.completed || 'Completed',
    cancelled: dict?.admin?.cancelled || 'Cancelled',
  };
  return labels[status] || status;
}

/**
 * Format date and time for display
 */
export function formatWorkOrderDateTime(dateString: string | Date): string {
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
 * Allowed work order status transitions.
 * Pipeline: pending -> assigned -> in_progress -> completed.
 * on_hold is reachable from in_progress and returns to in_progress.
 * cancelled is a terminal escape reachable from any non-terminal
 * (i.e. not already completed/cancelled) state. completed/cancelled
 * are themselves terminal — no further transitions.
 */
const ALLOWED_WORK_ORDER_STATUS_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  pending: ['pending', 'assigned', 'cancelled'],
  assigned: ['assigned', 'in_progress', 'on_hold', 'cancelled'],
  in_progress: ['in_progress', 'on_hold', 'completed', 'cancelled'],
  on_hold: ['on_hold', 'in_progress', 'cancelled'],
  completed: ['completed'],
  cancelled: ['cancelled'],
};

export function isValidWorkOrderStatusTransition(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return ALLOWED_WORK_ORDER_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Statuses selectable from the current one (includes the current status itself).
 */
export function getAllowedNextStatuses(from: WorkOrderStatus): WorkOrderStatus[] {
  return ALLOWED_WORK_ORDER_STATUS_TRANSITIONS[from] ?? [from];
}

/**
 * A terminal status (completed/cancelled) has no further transitions.
 */
export function isWorkOrderStatusEditable(status: WorkOrderStatus): boolean {
  return getAllowedNextStatuses(status).length > 1;
}

export function getDeleteWorkOrderConfirmMessage(dict?: Dict): string {
  return dict?.common?.cancelWorkOrderConfirm || 'Are you sure you want to cancel this work order?';
}
