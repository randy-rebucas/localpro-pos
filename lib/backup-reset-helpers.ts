export interface CollectionOption {
  key: string;
  label: string;
}

export const BACKUP_RESET_COLLECTIONS: CollectionOption[] = [
  { key: 'products', label: 'Products' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'categories', label: 'Categories' },
  { key: 'stockMovements', label: 'Stock Movements' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'discounts', label: 'Discounts' },
  { key: 'branches', label: 'Branches' },
  { key: 'cashDrawerSessions', label: 'Cash Drawer Sessions' },
  { key: 'productBundles', label: 'Product Bundles' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'savedCarts', label: 'Saved Carts' },
  { key: 'auditLogs', label: 'Audit Logs' },
];

export function formatCollectionName(collectionKey: string): string {
  return collectionKey.replace(/([A-Z])/g, ' $1').trim();
}

export function validateJsonFile(fileContent: string): { valid: boolean; error?: string; data?: any } { // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    const data = JSON.parse(fileContent);
    if (!data.collections) {
      return { valid: false, error: 'Invalid backup file. Missing collections data.' };
    }
    return { valid: true, data };
  } catch (e) {
    return { valid: false, error: 'Invalid backup file format. Please select a valid JSON backup file.' };
  }
}

export function formatFileSize(bytes: number): string {
  return (bytes / 1024).toFixed(2);
}

export function generateBackupFilename(tenant: string): string {
  return `backup-${tenant}-${new Date().toISOString().split('T')[0]}.json`;
}

export function hasSelectedCollections(selected: string[]): boolean {
  return selected.length > 0;
}

export function buildResetConfirmMessage(dict: any, count: number, collections: string[]): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    dict?.common?.resetCollectionsConfirm
      ?.replace('{count}', count.toString())
      ?.replace('{collections}', collections.join(', ')) ||
    `Are you sure you want to reset ${count} collection(s)?\n\n` +
    `Selected: ${collections.join(', ')}\n\n` +
    `This action cannot be undone!`
  );
}

export function buildClearExistingConfirmMessage(dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    dict?.common?.clearExistingDataConfirm ||
    'Are you sure you want to clear existing data before restoring?\n\n' +
    'This will delete all current data in the collections being restored!'
  );
}

export function canCreateBackup(selected: string[]): boolean {
  return selected.length > 0;
}

export function canRestore(file: File | null): boolean {
  return file !== null;
}

export function canReset(selected: string[], resetting: boolean): boolean {
  return selected.length > 0 && !resetting;
}

export function formatResultsMessage(collection: string, result: { restored?: number; deleted?: number; cleared?: number }): string {
  const formatted = formatCollectionName(collection);

  if (result.restored !== undefined) {
    let msg = `${formatted}: ${result.restored} record(s) restored`;
    if (result.cleared && result.cleared > 0) {
      msg += `, ${result.cleared} cleared`;
    }
    return msg;
  }

  if (result.deleted !== undefined) {
    return `${formatted}: ${result.deleted} record(s) deleted`;
  }

  return formatted;
}
