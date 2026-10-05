/**
 * Stock movements page helper functions
 */

export function getMovementTypeColor(type: string): string {
  // Solid Win8 badges (white text on token fills).
  const colors: Record<string, string> = {
    sale: 'bg-win8-info text-white',
    purchase: 'bg-win8-success text-white',
    adjustment: 'bg-brand text-white',
    return: 'bg-win8-warning text-white',
    damage: 'bg-win8-danger text-white',
    transfer: 'bg-win8-accent text-white',
  };
  return colors[type] || 'bg-gray-500 text-white';
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
