/**
 * Stock movements page helper functions
 */

export function getMovementTypeColor(type: string): string {
  const colors: Record<string, string> = {
    sale: 'bg-red-100 text-red-800',
    purchase: 'bg-green-100 text-green-800',
    adjustment: 'bg-brand-soft text-brand-navy',
    return: 'bg-yellow-100 text-yellow-800',
    damage: 'bg-orange-100 text-orange-800',
    transfer: 'bg-purple-100 text-purple-800',
  };
  return colors[type] || 'bg-gray-100 text-gray-800';
}

export function getFailedToFetchMovementsMessage(dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return dict?.common?.failedToFetchStockMovements || 'Failed to fetch stock movements';
}

export function getProductName(productId: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (typeof productId === 'object' && productId !== null) {
    return productId.name || 'Unknown';
  }
  return 'Unknown';
}

export function getProductSku(productId: any): string | undefined { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (typeof productId === 'object' && productId !== null) {
    return productId.sku;
  }
  return undefined;
}

export function getUserName(userId: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (typeof userId === 'object' && userId !== null) {
    return userId.name || 'System';
  }
  return 'System';
}

export function getReceiptNumber(transactionId: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (typeof transactionId === 'object' && transactionId !== null && transactionId?.receiptNumber) {
    return transactionId.receiptNumber;
  }
  if (typeof transactionId === 'string') {
    return transactionId;
  }
  return '-';
}

export function getNotes(notes: string | undefined, reason: string | undefined): string {
  return notes || reason || '-';
}
