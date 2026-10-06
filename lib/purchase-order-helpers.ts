/**
 * Purchase Order Utilities
 * Status formatting and transition rules (pattern-matched to lib/work-order-helpers.ts)
 */

export const PURCHASE_ORDER_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'partially_received', label: 'Partially Received' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export type PurchaseOrderStatus = typeof PURCHASE_ORDER_STATUSES[number]['value'];

export function getStatusColor(status: PurchaseOrderStatus): string {
  switch (status) {
    case 'draft':
      return 'bg-gray-500 text-white';
    case 'ordered':
      return 'bg-win8-info text-white';
    case 'partially_received':
      return 'bg-win8-suspended text-white';
    case 'received':
      return 'bg-win8-success text-white';
    case 'cancelled':
      return 'bg-win8-danger text-white';
    default:
      return 'bg-gray-500 text-white';
  }
}

type Dict = { admin?: Record<string, string | undefined>; common?: Record<string, string | undefined> };

export function getStatusLabel(status: PurchaseOrderStatus, dict?: Dict): string {
  const labels: Record<PurchaseOrderStatus, string> = {
    draft: dict?.admin?.draft || 'Draft',
    ordered: dict?.admin?.ordered || 'Ordered',
    partially_received: dict?.admin?.partiallyReceived || 'Partially Received',
    received: dict?.admin?.received || 'Received',
    cancelled: dict?.admin?.cancelled || 'Cancelled',
  };
  return labels[status] || status;
}

/**
 * Pipeline: draft -> ordered -> (partially_received) -> received.
 * cancelled is a terminal escape reachable from any non-terminal state.
 * received/cancelled are themselves terminal.
 */
const ALLOWED_PURCHASE_ORDER_STATUS_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  draft: ['draft', 'ordered', 'cancelled'],
  ordered: ['ordered', 'partially_received', 'received', 'cancelled'],
  partially_received: ['partially_received', 'received', 'cancelled'],
  received: ['received'],
  cancelled: ['cancelled'],
};

export function isValidPurchaseOrderStatusTransition(from: PurchaseOrderStatus, to: PurchaseOrderStatus): boolean {
  return ALLOWED_PURCHASE_ORDER_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getAllowedNextStatuses(from: PurchaseOrderStatus): PurchaseOrderStatus[] {
  return ALLOWED_PURCHASE_ORDER_STATUS_TRANSITIONS[from] ?? [from];
}

export function isPurchaseOrderStatusEditable(status: PurchaseOrderStatus): boolean {
  return getAllowedNextStatuses(status).length > 1;
}

export function formatPurchaseOrderDate(dateString: string | Date): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
