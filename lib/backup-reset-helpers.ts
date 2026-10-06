import { BACKUP_COLLECTION_SPECS, type CollectionGroup } from './backup-reset-collections';

export interface CollectionOption {
  key: string;
  label: string;
  group: CollectionGroup;
}

// Derived from the schema-checked registry so the UI can't drift from what
// the API accepts.
export const BACKUP_RESET_COLLECTIONS: CollectionOption[] = BACKUP_COLLECTION_SPECS.map(
  ({ key, label, group }) => ({ key, label, group })
);

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

export function formatResultsMessage(collection: string, result: { restored?: number; deleted?: number; cleared?: number; skipped?: number }): string {
  const formatted = formatCollectionName(collection);

  if (result.restored !== undefined) {
    let msg = `${formatted}: ${result.restored} record(s) restored`;
    if (result.cleared && result.cleared > 0) {
      msg += `, ${result.cleared} cleared`;
    }
    if (result.skipped && result.skipped > 0) {
      msg += `, ${result.skipped} skipped (parent not in this store)`;
    }
    return msg;
  }

  if (result.deleted !== undefined) {
    return `${formatted}: ${result.deleted} record(s) deleted`;
  }

  return formatted;
}
