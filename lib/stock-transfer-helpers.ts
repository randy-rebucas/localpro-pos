/**
 * Branch Stock Transfer Utilities
 * Status formatting and transition rules (pattern-matched to lib/purchase-order-helpers.ts)
 */

export const STOCK_TRANSFER_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'partially_received', label: 'Partially Received' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export type StockTransferStatus = typeof STOCK_TRANSFER_STATUSES[number]['value'];

export function getStatusColor(status: StockTransferStatus): string {
  switch (status) {
    case 'pending':
      return 'bg-gray-100 text-gray-800';
    case 'in_transit':
      return 'bg-blue-100 text-blue-800';
    case 'partially_received':
      return 'bg-orange-100 text-orange-800';
    case 'received':
      return 'bg-green-100 text-green-800';
    case 'cancelled':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

type Dict = Record<string, Record<string, string | undefined> | undefined>;

export function getStatusLabel(status: StockTransferStatus, dict?: Dict): string {
  const labels: Record<StockTransferStatus, string> = {
    pending: dict?.admin?.pending || 'Pending',
    in_transit: dict?.admin?.inTransit || 'In Transit',
    partially_received: dict?.admin?.partiallyReceived || 'Partially Received',
    received: dict?.admin?.received || 'Received',
    cancelled: dict?.admin?.cancelled || 'Cancelled',
  };
  return labels[status] || status;
}

/**
 * Pipeline: pending -> in_transit -> (partially_received) -> received.
 * cancelled is a terminal escape reachable from any non-terminal state.
 * received/cancelled are themselves terminal.
 */
const ALLOWED_STOCK_TRANSFER_STATUS_TRANSITIONS: Record<StockTransferStatus, StockTransferStatus[]> = {
  pending: ['pending', 'in_transit', 'cancelled'],
  in_transit: ['in_transit', 'partially_received', 'received', 'cancelled'],
  partially_received: ['partially_received', 'received', 'cancelled'],
  received: ['received'],
  cancelled: ['cancelled'],
};

export function isValidStockTransferStatusTransition(from: StockTransferStatus, to: StockTransferStatus): boolean {
  return ALLOWED_STOCK_TRANSFER_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getAllowedNextStatuses(from: StockTransferStatus): StockTransferStatus[] {
  return ALLOWED_STOCK_TRANSFER_STATUS_TRANSITIONS[from] ?? [from];
}

export function isStockTransferStatusEditable(status: StockTransferStatus): boolean {
  return getAllowedNextStatuses(status).length > 1;
}

export function formatStockTransferDate(dateString: string | Date): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
